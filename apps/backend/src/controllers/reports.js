// ============================================================
// Reportes de gerencia. Exponen el teórico -> solo rol GERENCIA.
// (El cajero nunca ve totales esperados: refuerza el cierre ciego.)
// ============================================================
import { getDb } from '../db.js';

/** GET /api/reports/turn-summary — ventas del turno en curso (desde último cierre). */
export async function turnSummary(_req, res) {
  const db = getDb();
  const periodRes = await db.execute({
    sql: `SELECT COALESCE(MAX(period_end), datetime('now','start of day')) AS start
          FROM cash_register_closures`,
    args: [],
  });
  const periodStart = periodRes.rows[0].start;

  const byMethod = await db.execute({
    sql: `SELECT payment_method, COUNT(*) AS ventas, COALESCE(SUM(total),0) AS monto
          FROM sales
          WHERE status='CONFIRMADA' AND sold_at >= ?
          GROUP BY payment_method`,
    args: [periodStart],
  });

  const topProducts = await db.execute({
    sql: `SELECT p.name, SUM(si.qty) AS unidades, SUM(si.line_total) AS monto
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id AND s.status='CONFIRMADA' AND s.sold_at >= ?
          JOIN products p ON p.id = si.product_id
          GROUP BY p.id ORDER BY unidades DESC LIMIT 10`,
    args: [periodStart],
  });

  const total = byMethod.rows.reduce((s, r) => s + Number(r.monto), 0);

  return res.json({
    period_start: periodStart,
    total,
    by_method: byMethod.rows,
    top_products: topProducts.rows,
  });
}

/** GET /api/reports/closures — historial de cierres con descuadres. */
export async function closuresHistory(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, period_start, period_end, diff_total, has_descuadre, created_at
          FROM cash_register_closures ORDER BY created_at DESC LIMIT 30`,
    args: [],
  });
  return res.json(rows);
}
