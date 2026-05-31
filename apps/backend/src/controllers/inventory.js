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
    sql: `SELECT id, name, stock_qty FROM ingredients WHERE id = ? AND is_active = 1`,
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
      sql: `INSERT INTO inventory_adjustments (id, ingredient_id, user_id, type, qty_delta, reason)
            VALUES (?,?,?,?,?,?)`,
      args: [adjId, ingredient_id, req.user.id, type, delta, String(reason).trim()],
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
