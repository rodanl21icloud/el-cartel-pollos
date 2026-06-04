// ============================================================
// Administración de catálogo (PUT/DELETE).
// Estas rutas activan `requireOtpForMutation`: cajero/preparador
// necesitan OTP de gerencia; gerencia pasa directo.
// DELETE es lógico (is_active=0) para respetar FKs de ventas históricas.
// ============================================================
import { randomUUID, randomBytes } from 'node:crypto';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

// KAN-28: nombre de producto inválido (debe ser descriptivo).
// Espejo de apps/frontend/src/lib/productName.js (validarNombreProducto).
//   - mínimo 3 caracteres
//   - no empieza con punto ni carácter especial (debe empezar con letra o dígito)
//   - sin patrón de código: mayúsculas pegadas a dígitos (UPBEB125, IMP-001)
function nombreInvalido(raw) {
  const n = String(raw ?? '').trim();
  if (n.length < 3) return true;                                  // vacío, solo espacios o < 3
  if (/^[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9]/.test(n)) return true;          // empieza con punto/carácter especial
  if (/[A-Z]{2,}-?\d+/.test(n)) return true;                      // patrón de código (UPBEB125, IMP-001)
  return false;
}

/**
 * GET /api/products/catalog — productos con costo por receta (BOM), ganancia y
 * margen, y si tienen receta (rebajan inventario). Para la gestión de la Carta.
 */
export async function listCatalog(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT p.id, p.sku, p.name, p.price, p.category, p.is_active, p.image_url, p.in_catalog, p.available,
                 COALESCE((SELECT SUM(pr.qty_per_unit * i.cost_unit)
                           FROM product_recipes pr JOIN ingredients i ON i.id = pr.ingredient_id
                           WHERE pr.product_id = p.id), 0) AS costo,
                 (SELECT COUNT(*) FROM product_recipes pr WHERE pr.product_id = p.id) AS recipe_lines
          FROM products p WHERE p.is_active = 1
          ORDER BY p.category, p.name`,
    args: [],
  });
  return res.json(rows.map((r) => {
    const price = Number(r.price); const costo = Math.round(Number(r.costo) * 100) / 100;
    const ganancia = Math.round((price - costo) * 100) / 100;
    return {
      id: r.id, sku: r.sku, name: r.name, price, category: r.category, image_url: r.image_url,
      in_catalog: r.in_catalog == null ? true : !!r.in_catalog,
      available: r.available == null ? true : !!r.available,
      costo, ganancia, margen: price > 0 ? Math.round((ganancia / price) * 100) : 0,
      has_recipe: Number(r.recipe_lines) > 0,
    };
  }));
}

/** POST /api/products  Body: { name, price, category?, sku?, image_url? } */
export async function createProduct(req, res) {
  const { name, price, category = 'COMBO', sku, image_url } = req.body || {};
  if (nombreInvalido(name)) return res.status(400).json({ error: 'NOMBRE_INVALIDO' });
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'PRECIO_INVALIDO' });

  const db = getDb();
  const id = randomUUID();
  const finalSku = (sku && String(sku).trim()) || `PRD-${randomBytes(3).toString('hex').toUpperCase()}`;
  try {
    await db.execute({
      sql: `INSERT INTO products (id, sku, name, price, category, image_url) VALUES (?,?,?,?,?,?)`,
      args: [id, finalSku, String(name).trim(), price, String(category).trim() || 'COMBO',
             image_url ? String(image_url).trim() : null],
    });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'SKU_DUPLICADO' });
    throw e;
  }
  await writeAudit({ userId: req.user.id, action: 'PRODUCT_CREATE', entity: 'products', entityId: id,
    severity: 'INFO', ip: req.ip, metadata: { name, price, sku: finalSku } });
  return res.status(201).json({ id, sku: finalSku, name: String(name).trim(), price, category, is_active: 1 });
}

/** PUT /api/products/:id  — edita precio / nombre / estado / foto. */
export async function updateProduct(req, res) {
  const { id } = req.params;
  const { name, price, is_active, image_url, in_catalog, available, description } = req.body || {};

  const db = getDb();
  const cur = await db.execute({ sql: `SELECT * FROM products WHERE id = ?`, args: [id] });
  if (!cur.rows.length) return res.status(404).json({ error: 'PRODUCTO_NO_ENCONTRADO' });

  if (price != null && (typeof price !== 'number' || price < 0)) {
    return res.status(400).json({ error: 'PRECIO_INVALIDO' });
  }
  // Solo se valida el nombre cuando se está cambiando (no bloquea editar foto/precio/visibilidad de productos existentes).
  if (name !== undefined && nombreInvalido(name)) {
    return res.status(400).json({ error: 'NOMBRE_INVALIDO' });
  }

  const next = {
    name: name ?? cur.rows[0].name,
    price: price ?? cur.rows[0].price,
    is_active: is_active != null ? (is_active ? 1 : 0) : cur.rows[0].is_active,
    image_url: image_url !== undefined ? (image_url ? String(image_url).trim() : null) : cur.rows[0].image_url,
    in_catalog: in_catalog != null ? (in_catalog ? 1 : 0) : (cur.rows[0].in_catalog == null ? 1 : cur.rows[0].in_catalog),
    available: available != null ? (available ? 1 : 0) : (cur.rows[0].available == null ? 1 : cur.rows[0].available),
    description: description !== undefined ? (description ? String(description).trim() : null) : cur.rows[0].description,
  };

  await db.execute({
    sql: `UPDATE products SET name = ?, price = ?, is_active = ?, image_url = ?, in_catalog = ?, available = ?, description = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [next.name, next.price, next.is_active, next.image_url, next.in_catalog, next.available, next.description, id],
  });
  // Historial de precio (solo si cambió).
  if (price != null && Number(next.price) !== Number(cur.rows[0].price)) {
    await db.execute({
      sql: `INSERT INTO product_price_history (id, product_id, old_price, new_price, changed_by, reason) VALUES (?,?,?,?,?,?)`,
      args: [randomUUID(), id, Number(cur.rows[0].price), Number(next.price), req.user.id, 'Edición'],
    });
  }

  await writeAudit({
    userId: req.user.id, action: 'PRODUCT_UPDATE', entity: 'products', entityId: id,
    severity: 'INFO', ip: req.ip,
    metadata: { before: { price: cur.rows[0].price, name: cur.rows[0].name }, after: next },
  });

  return res.json({ id, ...next });
}

/** DELETE /api/products/:id — baja lógica. */
export async function deleteProduct(req, res) {
  const { id } = req.params;
  const db = getDb();
  const cur = await db.execute({ sql: `SELECT id FROM products WHERE id = ?`, args: [id] });
  if (!cur.rows.length) return res.status(404).json({ error: 'PRODUCTO_NO_ENCONTRADO' });

  await db.execute({
    sql: `UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?`,
    args: [id],
  });
  await writeAudit({
    userId: req.user.id, action: 'PRODUCT_DELETE', entity: 'products', entityId: id,
    severity: 'WARN', ip: req.ip,
  });
  return res.json({ id, deleted: true });
}

/**
 * PUT /api/products/bulk-price — cambio masivo de precios.
 * Body: { category?, mode:'pct'|'monto'|'set', value, reason? }. Registra historial y auditoría.
 */
export async function bulkPriceChange(req, res) {
  const { category, mode, value, reason } = req.body || {};
  if (!['pct', 'monto', 'set'].includes(mode)) return res.status(400).json({ error: 'MODO_INVALIDO' });
  if (typeof value !== 'number' || !Number.isFinite(value)) return res.status(400).json({ error: 'VALOR_INVALIDO' });

  const db = getDb();
  const args = []; let where = 'is_active = 1';
  if (category && category !== 'TODO') { where += ' AND category = ?'; args.push(category); }
  const prods = (await db.execute({ sql: `SELECT id, price FROM products WHERE ${where}`, args })).rows;

  const stmts = []; let n = 0;
  for (const p of prods) {
    const old = Number(p.price);
    let np = mode === 'pct' ? old * (1 + value / 100) : mode === 'monto' ? old + value : value;
    np = Math.max(0, Math.round(np)); // CLP entero
    if (np === old) continue;
    n++;
    stmts.push({ sql: `UPDATE products SET price = ?, updated_at = datetime('now') WHERE id = ?`, args: [np, p.id] });
    stmts.push({ sql: `INSERT INTO product_price_history (id, product_id, old_price, new_price, changed_by, reason) VALUES (?,?,?,?,?,?)`,
      args: [randomUUID(), p.id, old, np, req.user.id, reason ? String(reason).trim() : 'Cambio masivo'] });
  }
  if (stmts.length) await db.batch(stmts, 'write');
  await writeAudit({ userId: req.user.id, action: 'PRODUCT_BULK_PRICE', entity: 'products', entityId: null,
    severity: 'WARN', ip: req.ip, metadata: { category: category || 'TODO', mode, value, afectados: n } });
  return res.json({ updated: n });
}

/** GET /api/products/:id/price-history — historial de precios de venta. */
export async function getPriceHistory(req, res) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT ph.old_price, ph.new_price, ph.reason, ph.created_at, u.full_name usuario
          FROM product_price_history ph LEFT JOIN users u ON u.id = ph.changed_by
          WHERE ph.product_id = ? ORDER BY ph.created_at DESC LIMIT 50`,
    args: [req.params.id],
  });
  return res.json(rows.map((r) => ({
    old_price: r.old_price != null ? Number(r.old_price) : null, new_price: Number(r.new_price),
    reason: r.reason, created_at: r.created_at, usuario: r.usuario || '—',
  })));
}

/** PUT /api/ingredients/:id — ajusta umbral mínimo / costo / nombre. */
export async function updateIngredient(req, res) {
  const { id } = req.params;
  const { name, min_stock_qty, cost_unit } = req.body || {};
  const db = getDb();
  const cur = await db.execute({ sql: `SELECT * FROM ingredients WHERE id = ?`, args: [id] });
  if (!cur.rows.length) return res.status(404).json({ error: 'INSUMO_NO_ENCONTRADO' });

  const next = {
    name: name ?? cur.rows[0].name,
    min_stock_qty: min_stock_qty ?? cur.rows[0].min_stock_qty,
    cost_unit: cost_unit ?? cur.rows[0].cost_unit,
  };
  await db.execute({
    sql: `UPDATE ingredients SET name = ?, min_stock_qty = ?, cost_unit = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [next.name, next.min_stock_qty, next.cost_unit, id],
  });
  await writeAudit({
    userId: req.user.id, action: 'INGREDIENT_UPDATE', entity: 'ingredients', entityId: id,
    severity: 'INFO', ip: req.ip, metadata: { after: next },
  });
  return res.json({ id, ...next });
}
