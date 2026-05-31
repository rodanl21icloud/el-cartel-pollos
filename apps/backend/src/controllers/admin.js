// ============================================================
// Administración de catálogo (PUT/DELETE).
// Estas rutas activan `requireOtpForMutation`: cajero/preparador
// necesitan OTP de gerencia; gerencia pasa directo.
// DELETE es lógico (is_active=0) para respetar FKs de ventas históricas.
// ============================================================
import { randomUUID, randomBytes } from 'node:crypto';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

/** POST /api/products  Body: { name, price, category?, sku? } */
export async function createProduct(req, res) {
  const { name, price, category = 'COMBO', sku } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'PRECIO_INVALIDO' });

  const db = getDb();
  const id = randomUUID();
  const finalSku = (sku && String(sku).trim()) || `PRD-${randomBytes(3).toString('hex').toUpperCase()}`;
  try {
    await db.execute({
      sql: `INSERT INTO products (id, sku, name, price, category) VALUES (?,?,?,?,?)`,
      args: [id, finalSku, String(name).trim(), price, String(category).trim() || 'COMBO'],
    });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'SKU_DUPLICADO' });
    throw e;
  }
  await writeAudit({ userId: req.user.id, action: 'PRODUCT_CREATE', entity: 'products', entityId: id,
    severity: 'INFO', ip: req.ip, metadata: { name, price, sku: finalSku } });
  return res.status(201).json({ id, sku: finalSku, name: String(name).trim(), price, category, is_active: 1 });
}

/** PUT /api/products/:id  — edita precio / nombre / estado. */
export async function updateProduct(req, res) {
  const { id } = req.params;
  const { name, price, is_active } = req.body || {};

  const db = getDb();
  const cur = await db.execute({ sql: `SELECT * FROM products WHERE id = ?`, args: [id] });
  if (!cur.rows.length) return res.status(404).json({ error: 'PRODUCTO_NO_ENCONTRADO' });

  if (price != null && (typeof price !== 'number' || price < 0)) {
    return res.status(400).json({ error: 'PRECIO_INVALIDO' });
  }

  const next = {
    name: name ?? cur.rows[0].name,
    price: price ?? cur.rows[0].price,
    is_active: is_active != null ? (is_active ? 1 : 0) : cur.rows[0].is_active,
  };

  await db.execute({
    sql: `UPDATE products SET name = ?, price = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [next.name, next.price, next.is_active, id],
  });

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
