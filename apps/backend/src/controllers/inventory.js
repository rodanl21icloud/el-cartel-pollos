// ============================================================
// Inventario: mermas obligatorias, listado de insumos y alertas de stock.
// La merma exige `reason` -> toda diferencia de inventario queda justificada.
// ============================================================
import { randomUUID } from 'node:crypto';
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

const UNITS = new Set(['unidad', 'gramo', 'mililitro', 'empaque']);

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
  const { qty, unit_cost, expense } = req.body || {};
  if (typeof qty !== 'number' || !(qty > 0)) return res.status(400).json({ error: 'CANTIDAD_INVALIDA' });
  if (unit_cost != null && (typeof unit_cost !== 'number' || unit_cost < 0)) return res.status(400).json({ error: 'COSTO_INVALIDO' });

  const db = getDb();
  const ing = await db.execute({ sql: `SELECT id, name, cost_unit FROM ingredients WHERE id = ? AND is_active = 1`, args: [id] });
  if (!ing.rows.length) return res.status(404).json({ error: 'INSUMO_NO_ENCONTRADO' });

  const costo = unit_cost != null ? unit_cost : Number(ing.rows[0].cost_unit);
  const adjId = randomUUID();
  const stmts = [
    { sql: `UPDATE ingredients SET stock_qty = stock_qty + ?, ${unit_cost != null ? 'cost_unit = ?, ' : ''} updated_at = datetime('now') WHERE id = ?`,
      args: unit_cost != null ? [qty, unit_cost, id] : [qty, id] },
    { sql: `INSERT INTO inventory_adjustments (id, ingredient_id, user_id, type, qty_delta, unit_cost, reason)
            VALUES (?,?,?, 'REPOSICION', ?, ?, ?)`,
      args: [adjId, id, req.user.id, qty, costo, `Reposición de ${ing.rows[0].name}`] },
  ];

  let expenseId = null;
  if (expense && expense.payment_method) {
    expenseId = randomUUID();
    const monto = qty * costo;
    stmts.push({
      sql: `INSERT INTO expenses (id, category_id, user_id, amount, payment_method, supplier, description, spent_at)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [expenseId, expense.category_id || 'cat-proveedores', req.user.id, monto, expense.payment_method,
             expense.supplier || null, `Compra de ${ing.rows[0].name} (${qty})`, new Date().toISOString()],
    });
  }
  stmts.push({
    sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
          VALUES (?,?, 'INV_REPOSICION', 'inventory_adjustments', ?, 'INFO', ?, ?)`,
    args: [randomUUID(), req.user.id, adjId, JSON.stringify({ qty, costo, expenseId }), req.ip || null],
  });

  await db.batch(stmts, 'write');
  const newStock = await db.execute({ sql: `SELECT stock_qty FROM ingredients WHERE id = ?`, args: [id] });
  return res.status(201).json({ ingredient: ing.rows[0].name, new_stock: Number(newStock.rows[0].stock_qty), expense_id: expenseId });
}

/** GET /api/inventory/alerts — insumos en o bajo el umbral mínimo. */
export async function lowStockAlerts(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, name, unit, stock_qty, min_stock_qty
          FROM ingredients
          WHERE is_active = 1 AND stock_qty <= min_stock_qty
          ORDER BY (stock_qty - min_stock_qty) ASC`,
    args: [],
  });
  return res.json({ count: rows.length, alerts: rows });
}
