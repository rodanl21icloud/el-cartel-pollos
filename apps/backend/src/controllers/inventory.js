// ============================================================
// Inventario: mermas obligatorias, listado de insumos y alertas de stock.
// La merma exige `reason` -> toda diferencia de inventario queda justificada.
// ============================================================
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

const MERMA_TYPES = new Set(['MERMA', 'REPOSICION', 'CONTEO']);

/**
 * POST /api/inventory/merma
 * Body: { ingredient_id, qty, reason, type? }
 *  - MERMA / CONTEO -> descuenta stock.  REPOSICION -> repone.
 */
export async function registerMerma(req, res) {
  const { ingredient_id, qty, reason, type = 'MERMA' } = req.body || {};

  if (!ingredient_id) return res.status(400).json({ error: 'INSUMO_REQUERIDO' });
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: 'CANTIDAD_INVALIDA' });
  }
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'JUSTIFICACION_OBLIGATORIA' });
  }
  if (!MERMA_TYPES.has(type)) return res.status(400).json({ error: 'TIPO_INVALIDO' });

  const db = getDb();
  const ing = await db.execute({
    sql: `SELECT id, name, stock_qty, cost_unit FROM ingredients WHERE id = ? AND is_active = 1`,
    args: [ingredient_id],
  });
  if (!ing.rows.length) return res.status(404).json({ error: 'INSUMO_NO_ENCONTRADO' });

  const sign = type === 'REPOSICION' ? 1 : -1;
  const delta = sign * qty;
  const current = Number(ing.rows[0].stock_qty);
  if (sign < 0 && current < qty) {
    return res.status(409).json({ error: 'STOCK_INSUFICIENTE', detail: { have: current, need: qty } });
  }

  const adjId = randomUUID();
  await db.batch([
    {
      sql: `UPDATE ingredients SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?`,
      args: [delta, ingredient_id],
    },
    {
      sql: `INSERT INTO inventory_adjustments (id, ingredient_id, user_id, type, qty_delta, unit_cost, reason)
            VALUES (?,?,?,?,?,?,?)`,
      args: [adjId, ingredient_id, req.user.id, type, delta, Number(ing.rows[0].cost_unit), String(reason).trim()],
    },
    {
      sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
            VALUES (?,?, ?, 'inventory_adjustments', ?, 'WARN', ?, ?)`,
      args: [randomUUID(), req.user.id, `INV_${type}`, adjId,
             JSON.stringify({ ingredient: ing.rows[0].name, delta, reason }), req.ip || null],
    },
  ], 'write');

  return res.status(201).json({
    adjustment_id: adjId,
    ingredient: ing.rows[0].name,
    new_stock: current + delta,
  });
}

// Unidades que solo admiten enteros (no fracciones).
const ENTERAS = new Set(['unidad', 'empaque']);

/**
 * POST /api/inventory/ingredients/:id/set-stock
 * Ajuste manual AUDITADO de existencias (corrección, conteo, compra no registrada…).
 * Body: { new_qty, reason, pin, note?, mode? } — exige el PIN de administrador.
 *   - new_qty: cantidad FINAL del insumo (el cliente la calcula si es suma/resta).
 *   - mode: 'REEMPLAZO' (fijar valor) | 'AJUSTE' (suma/resta) — solo para la traza.
 * Registra stock anterior/nuevo, tipo, motivo, observación, usuario y timestamp.
 */
export async function setIngredientStock(req, res) {
  const { id } = req.params;
  const { new_qty, reason, pin, note, mode, cost_unit, name, unit } = req.body || {};

  if (typeof new_qty !== 'number' || !Number.isFinite(new_qty) || new_qty < 0) {
    return res.status(400).json({ error: 'CANTIDAD_INVALIDA' });
  }
  const costProvided = cost_unit !== undefined && cost_unit !== null && cost_unit !== '';
  if (costProvided && (typeof cost_unit !== 'number' || !Number.isFinite(cost_unit) || cost_unit < 0)) {
    return res.status(400).json({ error: 'COSTO_INVALIDO' });
  }
  const unitProvided = unit !== undefined && unit !== null && unit !== '';
  if (unitProvided && !['unidad', 'gramo', 'mililitro', 'litro', 'empaque'].includes(unit)) {
    return res.status(400).json({ error: 'UNIDAD_INVALIDA' });
  }
  if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'MOTIVO_OBLIGATORIO' });
  if (!pin) return res.status(400).json({ error: 'PIN_REQUERIDO' });

  const db = getDb();
  // PIN de administrador.
  const st = (await db.execute({ sql: `SELECT admin_pin_hash FROM business_settings WHERE id = 1`, args: [] })).rows[0];
  if (!st || !st.admin_pin_hash) return res.status(409).json({ error: 'PIN_NO_CONFIGURADO', detail: 'Configura el PIN de administrador en Configuración.' });
  const ok = await bcrypt.compare(String(pin), st.admin_pin_hash);
  if (!ok) {
    await writeAudit({ userId: req.user.id, action: 'STOCK_PIN_REJECT', entity: 'ingredients', entityId: id, severity: 'ALERT', ip: req.ip });
    return res.status(403).json({ error: 'PIN_INVALIDO' });
  }

  const ing = (await db.execute({ sql: `SELECT id, name, unit, stock_qty, cost_unit FROM ingredients WHERE id = ? AND is_active = 1`, args: [id] })).rows[0];
  if (!ing) return res.status(404).json({ error: 'INSUMO_NO_ENCONTRADO' });

  const unitNuevo = unitProvided ? unit : ing.unit;
  // Validación de decimales según la unidad efectiva (unidad/empaque = enteros).
  if (ENTERAS.has(unitNuevo) && !Number.isInteger(new_qty)) {
    return res.status(400).json({ error: 'DECIMAL_NO_PERMITIDO', detail: `La unidad "${unitNuevo}" no admite decimales.` });
  }

  const stockAnterior = Number(ing.stock_qty);
  const stockNuevo = new_qty;
  const delta = Math.round((stockNuevo - stockAnterior) * 1000) / 1000;
  const costAnterior = Number(ing.cost_unit);
  const costNuevo = costProvided ? cost_unit : costAnterior;
  const nameNuevo = (name !== undefined && String(name).trim()) ? String(name).trim() : ing.name;
  const adjId = randomUUID();
  const motivo = String(reason).trim();
  const obs = note ? String(note).trim() : null;
  const tipo = mode === 'AJUSTE' ? 'AJUSTE' : 'REEMPLAZO';
  // La observación se anexa al motivo en el ajuste de inventario (traza completa).
  const reasonFull = obs ? `${motivo} — ${obs}` : motivo;

  try {
    await db.batch([
      { sql: `UPDATE ingredients SET name = ?, unit = ?, stock_qty = ?, cost_unit = ?, updated_at = datetime('now') WHERE id = ?`, args: [nameNuevo, unitNuevo, stockNuevo, costNuevo, id] },
      {
        sql: `INSERT INTO inventory_adjustments (id, ingredient_id, user_id, type, qty_delta, unit_cost, reason)
              VALUES (?,?,?, 'CONTEO', ?, ?, ?)`,
        args: [adjId, id, req.user.id, delta, costNuevo, reasonFull],
      },
      {
        sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
              VALUES (?,?, 'STOCK_AJUSTE', 'ingredients', ?, 'WARN', ?, ?)`,
        args: [randomUUID(), req.user.id, id,
               JSON.stringify({ ingredient: nameNuevo, nombre_anterior: ing.name, unidad: unitNuevo, unidad_anterior: ing.unit, tipo, stock_anterior: stockAnterior, stock_nuevo: stockNuevo, delta, costo_anterior: costAnterior, costo_nuevo: costNuevo, motivo, observacion: obs }), req.ip || null],
      },
    ], 'write');
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'NOMBRE_DUPLICADO' });
    throw e;
  }

  return res.status(201).json({
    adjustment_id: adjId, ingredient: nameNuevo, tipo,
    stock_anterior: stockAnterior, stock_nuevo: stockNuevo, delta,
    cost_anterior: costAnterior, cost_nuevo: costNuevo,
  });
}

/** GET /api/inventory/ingredients — listado para mermas y administración. */
export async function listIngredients(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, name, unit, stock_qty, min_stock_qty, cost_unit
          FROM ingredients WHERE is_active = 1 ORDER BY name`,
    args: [],
  });
  return res.json(rows);
}

const UNITS = new Set(['unidad', 'gramo', 'mililitro', 'litro', 'empaque']);

/** POST /api/inventory/ingredients  Body: { name, unit, stock_qty?, min_stock_qty?, cost_unit? } */
export async function createIngredient(req, res) {
  const { name, unit, stock_qty = 0, min_stock_qty = 0, cost_unit = 0 } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  if (!UNITS.has(unit)) return res.status(400).json({ error: 'UNIDAD_INVALIDA' });
  for (const [k, v] of Object.entries({ stock_qty, min_stock_qty, cost_unit })) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'VALOR_INVALIDO', field: k });
  }

  const db = getDb();
  const id = randomUUID();
  try {
    await db.execute({
      sql: `INSERT INTO ingredients (id, name, unit, stock_qty, min_stock_qty, cost_unit)
            VALUES (?,?,?,?,?,?)`,
      args: [id, String(name).trim(), unit, stock_qty, min_stock_qty, cost_unit],
    });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'NOMBRE_DUPLICADO' });
    throw e;
  }
  await writeAudit({ userId: req.user.id, action: 'INGREDIENT_CREATE', entity: 'ingredients', entityId: id,
    severity: 'INFO', ip: req.ip, metadata: { name, unit } });
  return res.status(201).json({ id, name: String(name).trim(), unit, stock_qty, min_stock_qty, cost_unit });
}

/** DELETE /api/inventory/ingredients/:id — baja lógica. Bloquea si está en una receta. */
export async function deleteIngredient(req, res) {
  const { id } = req.params;
  const db = getDb();
  const used = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM product_recipes WHERE ingredient_id = ?`, args: [id],
  });
  if (Number(used.rows[0].n) > 0) {
    return res.status(409).json({ error: 'INSUMO_EN_USO', detail: 'Está en una o más recetas. Quítalo de las recetas primero.' });
  }
  const cur = await db.execute({ sql: `SELECT id FROM ingredients WHERE id = ?`, args: [id] });
  if (!cur.rows.length) return res.status(404).json({ error: 'INSUMO_NO_ENCONTRADO' });

  await db.execute({ sql: `UPDATE ingredients SET is_active = 0, updated_at = datetime('now') WHERE id = ?`, args: [id] });
  await writeAudit({ userId: req.user.id, action: 'INGREDIENT_DELETE', entity: 'ingredients', entityId: id,
    severity: 'WARN', ip: req.ip });
  return res.json({ id, deleted: true });
}

/**
 * POST /api/inventory/ingredients/:id/restock — reponer stock (compra).
 * Body: { qty, unit_cost?, expense? } donde expense = { payment_method, category_id?, supplier? }
 * Si viene `expense`, registra también el gasto por qty×unit_cost.
 */
export async function restockIngredient(req, res) {
  const { id } = req.params;
  const { qty, unit_cost, supplier, note, expense } = req.body || {};
  if (typeof qty !== 'number' || !(qty > 0)) return res.status(400).json({ error: 'CANTIDAD_INVALIDA' });
  // El costo de ESTA compra es obligatorio (>0): es lo que permite monitorear el precio.
  if (typeof unit_cost !== 'number' || !(unit_cost > 0)) return res.status(400).json({ error: 'COSTO_INVALIDO' });

  const db = getDb();
  const ing = await db.execute({ sql: `SELECT id, name, stock_qty, cost_unit FROM ingredients WHERE id = ? AND is_active = 1`, args: [id] });
  if (!ing.rows.length) return res.status(404).json({ error: 'INSUMO_NO_ENCONTRADO' });

  // Costo del insumo (BOM) = promedio ponderado móvil. La fila de ajuste guarda el
  // costo REAL de la compra (unit_cost) para el historial de precios.
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const stockAnt = Number(ing.rows[0].stock_qty), costAnt = Number(ing.rows[0].cost_unit);
  const costoPromedio = stockAnt + qty > 0 ? round2((stockAnt * costAnt + qty * unit_cost) / (stockAnt + qty)) : unit_cost;
  const prov = supplier || expense?.supplier || null;
  const nota = note ? String(note).trim() : null;
  const reason = `Reposición de ${ing.rows[0].name}${prov ? ` · ${prov}` : ''}${nota ? ` — ${nota}` : ''}`;

  const adjId = randomUUID();
  const stmts = [
    { sql: `UPDATE ingredients SET stock_qty = stock_qty + ?, cost_unit = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [qty, costoPromedio, id] },
    { sql: `INSERT INTO inventory_adjustments (id, ingredient_id, user_id, type, qty_delta, unit_cost, reason)
            VALUES (?,?,?, 'REPOSICION', ?, ?, ?)`,
      args: [adjId, id, req.user.id, qty, unit_cost, reason] },
  ];

  let expenseId = null;
  if (expense && expense.payment_method) {
    expenseId = randomUUID();
    const monto = qty * unit_cost;
    stmts.push({
      sql: `INSERT INTO expenses (id, category_id, user_id, amount, payment_method, supplier, description, spent_at)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [expenseId, expense.category_id || 'cat-proveedores', req.user.id, monto, expense.payment_method,
             prov, `Compra de ${ing.rows[0].name} (${qty})`, new Date().toISOString()],
    });
  }
  stmts.push({
    sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
          VALUES (?,?, 'INV_REPOSICION', 'inventory_adjustments', ?, 'INFO', ?, ?)`,
    args: [randomUUID(), req.user.id, adjId,
           JSON.stringify({ qty, unit_cost, costo_anterior: costAnt, costo_promedio: costoPromedio, proveedor: prov, nota, expenseId }), req.ip || null],
  });

  await db.batch(stmts, 'write');
  const newStock = await db.execute({ sql: `SELECT stock_qty FROM ingredients WHERE id = ?`, args: [id] });
  return res.status(201).json({ ingredient: ing.rows[0].name, new_stock: Number(newStock.rows[0].stock_qty), unit_cost, cost_unit: costoPromedio, expense_id: expenseId });
}

/**
 * GET /api/inventory/alerts — insumos en o bajo el umbral, con SEVERIDAD y días
 * estimados a quiebre (según consumo diario por BOM de los últimos 30 días).
 */
export async function lowStockAlerts(_req, res) {
  const db = getDb();
  const cons = new Map(); // ingredient_id -> consumo diario
  const cr = (await db.execute({
    sql: `SELECT ingredient_id, COALESCE(SUM(ABS(qty_delta)),0) q FROM inventory_adjustments
          WHERE type='VENTA' AND datetime(created_at) >= datetime('now','-30 days') GROUP BY ingredient_id`,
    args: [],
  })).rows;
  for (const r of cr) cons.set(r.ingredient_id, Number(r.q) / 30);

  const { rows } = await db.execute({
    sql: `SELECT id, name, unit, stock_qty, min_stock_qty
          FROM ingredients WHERE is_active = 1 AND stock_qty <= min_stock_qty
          ORDER BY (stock_qty - min_stock_qty) ASC`,
    args: [],
  });
  const alerts = rows.map((r) => {
    const stock = Number(r.stock_qty), min = Number(r.min_stock_qty);
    const diario = cons.get(r.id) || 0;
    const dias = diario > 0 ? Math.floor(stock / diario) : null;
    const severidad = stock <= 0 ? 'AGOTADO'
      : (dias != null && dias <= 2) || stock <= min * 0.5 ? 'CRITICO' : 'BAJO';
    return { id: r.id, name: r.name, unit: r.unit, stock_qty: stock, min_stock_qty: min,
      consumo_diario: Math.round(diario * 100) / 100, dias_a_quiebre: dias, severidad };
  });
  return res.json({ count: alerts.length, alerts });
}

/** GET /api/inventory/mermas?days=30 — historial de mermas por insumo + detalle. */
export async function mermasHistorial(req, res) {
  const db = getDb();
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const since = `-${days} days`;
  const por_insumo = (await db.execute({
    sql: `SELECT i.name, i.unit, COUNT(*) n, COALESCE(SUM(ABS(ia.qty_delta)),0) qty, COALESCE(SUM(ABS(ia.qty_delta)*ia.unit_cost),0) costo
          FROM inventory_adjustments ia JOIN ingredients i ON i.id = ia.ingredient_id
          WHERE ia.type='MERMA' AND datetime(ia.created_at) >= datetime('now', ?)
          GROUP BY i.id ORDER BY costo DESC`,
    args: [since],
  })).rows.map((r) => ({ name: r.name, unit: r.unit, n: Number(r.n), qty: Number(r.qty), costo: Math.round(Number(r.costo)) }));
  const detalle = (await db.execute({
    sql: `SELECT ia.created_at fecha, i.name, i.unit, ABS(ia.qty_delta) qty, ia.reason, u.full_name usuario
          FROM inventory_adjustments ia JOIN ingredients i ON i.id = ia.ingredient_id LEFT JOIN users u ON u.id = ia.user_id
          WHERE ia.type='MERMA' AND datetime(ia.created_at) >= datetime('now', ?)
          ORDER BY ia.created_at DESC LIMIT 60`,
    args: [since],
  })).rows.map((r) => ({ fecha: r.fecha, name: r.name, unit: r.unit, qty: Number(r.qty), reason: r.reason, usuario: r.usuario || '—' }));
  return res.json({ days, total_costo: por_insumo.reduce((s, r) => s + r.costo, 0), por_insumo, detalle });
}
