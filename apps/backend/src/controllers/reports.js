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
    sql: `SELECT id, period_start, period_end, opening_float, diff_total, has_descuadre, created_at
          FROM cash_register_closures ORDER BY created_at DESC LIMIT 30`,
    args: [],
  });
  return res.json(rows);
}

/**
 * GET /api/reports/cash-flow?from=&to=
 * Flujo de caja de TODO el dinero (efectivo + POS + transferencia):
 * ingresos (ventas) vs egresos (gastos) por día, con saldo acumulado.
 * Incluye desglose de egresos por categoría. (GERENCIA)
 */
export async function cashFlow(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  // Por defecto, últimos 30 días.
  const from = req.query.from ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Ingresos por día (ventas confirmadas).
  const ingresosRes = await db.execute({
    sql: `SELECT substr(sold_at,1,10) AS dia, COALESCE(SUM(total),0) AS monto
          FROM sales WHERE status='CONFIRMADA' AND sold_at >= ? AND sold_at <= ?
          GROUP BY dia`,
    args: [from, to],
  });
  // Egresos por día (todos los gastos).
  const egresosRes = await db.execute({
    sql: `SELECT substr(spent_at,1,10) AS dia, COALESCE(SUM(amount),0) AS monto
          FROM expenses WHERE spent_at >= ? AND spent_at <= ?
          GROUP BY dia`,
    args: [from, to],
  });

  const dias = new Map();
  for (const r of ingresosRes.rows) dias.set(r.dia, { dia: r.dia, ingresos: Number(r.monto), egresos: 0 });
  for (const r of egresosRes.rows) {
    const d = dias.get(r.dia) || { dia: r.dia, ingresos: 0, egresos: 0 };
    d.egresos = Number(r.monto);
    dias.set(r.dia, d);
  }
  const ordenados = [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  let saldo = 0;
  const flujo = ordenados.map((d) => {
    const neto = round2(d.ingresos - d.egresos);
    saldo = round2(saldo + neto);
    return { ...d, neto, saldo_acumulado: saldo };
  });

  // Desglose de egresos por categoría.
  const porCategoriaRes = await db.execute({
    sql: `SELECT c.name AS categoria, c.kind, COALESCE(SUM(e.amount),0) AS monto
          FROM expenses e JOIN expense_categories c ON c.id = e.category_id
          WHERE e.spent_at >= ? AND e.spent_at <= ?
          GROUP BY c.id ORDER BY monto DESC`,
    args: [from, to],
  });

  const total_ingresos = round2(flujo.reduce((s, d) => s + d.ingresos, 0));
  const total_egresos = round2(flujo.reduce((s, d) => s + d.egresos, 0));

  return res.json({
    period: { from, to },
    total_ingresos,
    total_egresos,
    neto: round2(total_ingresos - total_egresos),
    por_dia: flujo,
    egresos_por_categoria: porCategoriaRes.rows.map((r) => ({
      categoria: r.categoria, kind: r.kind, monto: Number(r.monto),
    })),
  });
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (num, den) => (den > 0 ? round2((num / den) * 100) : 0);

/**
 * GET /api/reports/pnl?from=&to=
 * Estado de Resultados (P&L). Combina ventas, costo real de insumos (BOM,
 * costo congelado por movimiento), mermas y gastos operativos. (GERENCIA)
 *   Utilidad bruta     = ventas − costo insumos
 *   Utilidad operativa = utilidad bruta − mermas − gastos operativos
 * Los RETIROS de socios no son gasto operativo (son distribución): se muestran aparte.
 */
export async function pnl(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from ||
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

  // Ventas (ingresos) en el período.
  const ventasRes = await db.execute({
    sql: `SELECT COALESCE(SUM(total),0) AS monto FROM sales
          WHERE status='CONFIRMADA' AND sold_at >= ? AND sold_at <= ?`,
    args: [from, to],
  });
  const ventas = Number(ventasRes.rows[0].monto);

  // Costo de insumos vendidos (COGS) y mermas, con costo congelado.
  const cogsRes = await db.execute({
    sql: `SELECT type, COALESCE(SUM(ABS(qty_delta) * unit_cost),0) AS costo
          FROM inventory_adjustments
          WHERE type IN ('VENTA','MERMA') AND created_at >= ? AND created_at <= ?
          GROUP BY type`,
    args: [from, to],
  });
  let costo_insumos = 0, mermas = 0;
  for (const r of cogsRes.rows) {
    if (r.type === 'VENTA') costo_insumos = round2(Number(r.costo));
    if (r.type === 'MERMA') mermas = round2(Number(r.costo));
  }

  // Gastos por categoría, separando operativos de retiros.
  const gastosRes = await db.execute({
    sql: `SELECT c.name AS categoria, c.kind, COALESCE(SUM(e.amount),0) AS monto
          FROM expenses e JOIN expense_categories c ON c.id = e.category_id
          WHERE e.spent_at >= ? AND e.spent_at <= ?
          GROUP BY c.id ORDER BY monto DESC`,
    args: [from, to],
  });
  let gastos_operativos = 0, retiros = 0;
  const gastos_por_categoria = [];
  for (const r of gastosRes.rows) {
    const monto = round2(Number(r.monto));
    if (r.kind === 'RETIRO') retiros += monto;
    else { gastos_operativos += monto; gastos_por_categoria.push({ categoria: r.categoria, monto }); }
  }
  gastos_operativos = round2(gastos_operativos);
  retiros = round2(retiros);

  const utilidad_bruta = round2(ventas - costo_insumos);
  const utilidad_operativa = round2(utilidad_bruta - mermas - gastos_operativos);

  return res.json({
    period: { from, to },
    ventas,
    costo_insumos,
    utilidad_bruta,
    mermas,
    gastos_operativos,
    gastos_por_categoria,
    utilidad_operativa,
    retiros,
    utilidad_despues_retiros: round2(utilidad_operativa - retiros),
    margenes: {
      food_cost_pct: pct(costo_insumos, ventas),     // % de ventas que se va en insumos
      merma_pct: pct(mermas, ventas),
      utilidad_bruta_pct: pct(utilidad_bruta, ventas),
      utilidad_operativa_pct: pct(utilidad_operativa, ventas),
    },
  });
}
