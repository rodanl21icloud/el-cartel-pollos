// ============================================================
// "Hoy" — centro de mando operativo. Compone en UN request los KPIs del día
// desde tablas existentes (sales, expenses, ingredients, cash_sessions,
// cash_register_closures, audit_logs). Sin tablas nuevas. Calcula semáforos y
// alertas accionables server-side. Permiso: reports.view (gerencia/encargado).
// ============================================================
import { getDb } from '../db.js';
import { chileBusinessDay } from '../services/sales.js';

// Umbrales parametrizables (overridables por env).
const FOOD_COST_AMBER = Number(process.env.FOOD_COST_AMBER_PCT || 30);
const FOOD_COST_RED = Number(process.env.FOOD_COST_RED_PCT || 35);
const VOID_AMBER = Number(process.env.VOID_ALERT_COUNT || 3);
const num = (v) => Number(v || 0);

export async function today(_req, res) {
  const db = getDb();
  const day = chileBusinessDay();
  const prevWeek = chileBusinessDay(new Date(Date.now() - 7 * 86400000));
  const q = async (sql, args = []) => (await db.execute({ sql, args })).rows;

  const ventasDe = async (bd) => {
    const r = (await q(`SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM sales WHERE business_day=? AND status='CONFIRMADA'`, [bd]))[0];
    return { n: num(r.n), total: num(r.t), ticket: num(r.n) ? Math.round(num(r.t) / num(r.n)) : 0 };
  };

  const [hoy, semanaPasada, pagos, activosRow, voidsRow, cogsRow, top, sesion, critRows, critCount, incid, cierre, polloRow] = await Promise.all([
    ventasDe(day),
    ventasDe(prevWeek),
    q(`SELECT payment_method m, COALESCE(SUM(total),0) t, COUNT(*) n FROM sales WHERE business_day=? AND status='CONFIRMADA' GROUP BY payment_method`, [day]),
    q(`SELECT COUNT(*) n FROM sales WHERE business_day=? AND status='CONFIRMADA' AND dispatch_status IN ('PENDIENTE','EN_PREPARACION','LISTO')`, [day]),
    q(`SELECT COUNT(*) n FROM sales WHERE business_day=? AND status='ANULADA'`, [day]),
    q(`SELECT COALESCE(SUM(si.qty * (SELECT COALESCE(SUM(pr.qty_per_unit*i.cost_unit),0) FROM product_recipes pr JOIN ingredients i ON i.id=pr.ingredient_id WHERE pr.product_id=si.product_id)),0) cogs
        FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.business_day=? AND s.status='CONFIRMADA'`, [day]),
    q(`SELECT p.name, SUM(si.qty) u, COALESCE(SUM(si.line_total),0) t
        FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.business_day=? AND s.status='CONFIRMADA'
        JOIN products p ON p.id=si.product_id GROUP BY p.id ORDER BY t DESC LIMIT 6`, [day]),
    q(`SELECT opening_float, opened_at, pollos_horno, pollos_crudos_ini, sacos_papas_ini FROM cash_sessions WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 1`),
    q(`SELECT name, unit, stock_qty, min_stock_qty FROM ingredients WHERE is_active=1 AND stock_qty<=min_stock_qty ORDER BY (stock_qty-min_stock_qty) ASC LIMIT 5`),
    q(`SELECT COUNT(*) n FROM ingredients WHERE is_active=1 AND stock_qty<=min_stock_qty`),
    q(`SELECT action, severity, created_at FROM audit_logs WHERE severity IN ('ALERT','WARN') AND substr(created_at,1,10)=? ORDER BY created_at DESC LIMIT 8`, [day]),
    q(`SELECT period_end, diff_total, has_descuadre, created_at FROM cash_register_closures ORDER BY created_at DESC LIMIT 1`),
    q(`SELECT COALESCE(SUM(si.qty),0) u FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.business_day=? AND s.status='CONFIRMADA'
        JOIN products p ON p.id=si.product_id WHERE p.category='POLLO'`, [day]),
  ]);

  const cogs = num(cogsRow[0]?.cogs);
  const foodCostPct = hoy.total > 0 ? Math.round((cogs / hoy.total) * 100) : 0;
  const cajaAbierta = !!sesion[0];
  const stockCriticos = num(critCount[0]?.n);
  const anulaciones = num(voidsRow[0]?.n);

  // --- Alertas / semáforos accionables ---
  const alerts = [];
  if (!cajaAbierta) alerts.push({ level: 'red', area: 'Caja', msg: 'Caja sin abrir', action: 'Ábrela para registrar ventas y poder cuadrar', route: 'cash' });
  if (foodCostPct >= FOOD_COST_RED) alerts.push({ level: 'red', area: 'Costos', msg: `Food cost alto (${foodCostPct}%)`, action: 'Revisa recetas o precios de compra', route: 'carta' });
  else if (foodCostPct >= FOOD_COST_AMBER) alerts.push({ level: 'amber', area: 'Costos', msg: `Food cost ${foodCostPct}%`, action: 'Vigila recetas y compras', route: 'carta' });
  if (stockCriticos > 0) alerts.push({ level: 'amber', area: 'Inventario', msg: `${stockCriticos} insumo(s) en stock crítico`, action: 'Repón o sustituye', route: 'inventario' });
  if (anulaciones > VOID_AMBER) alerts.push({ level: 'amber', area: 'Ventas', msg: `${anulaciones} anulaciones hoy`, action: 'Revísalas con el equipo', route: 'auditoria' });
  if (incid.length > 0) alerts.push({ level: 'amber', area: 'Auditoría', msg: `${incid.length} incidencia(s) sensible(s) hoy`, action: 'Revisa la auditoría del turno', route: 'auditoria' });
  if (cierre[0]?.has_descuadre) alerts.push({ level: 'amber', area: 'Caja', msg: 'El cierre anterior tuvo descuadre', action: 'Compara el arqueo del turno', route: 'cuadre' });

  const deltaVentas = semanaPasada.total > 0 ? Math.round(((hoy.total - semanaPasada.total) / semanaPasada.total) * 100) : null;

  return res.json({
    day,
    ventas: { ...hoy, delta_pct: deltaVentas, vs_semana_pasada: semanaPasada.total },
    pagos: pagos.map((r) => ({ metodo: r.m, total: num(r.t), n: num(r.n) })),
    pedidos_activos: num(activosRow[0]?.n),
    anulaciones,
    food_cost_pct: foodCostPct,
    caja: cajaAbierta
      ? { open: true, opening_float: num(sesion[0].opening_float), opened_at: sesion[0].opened_at }
      : { open: false },
    horno: {
      enviados: num(sesion[0]?.pollos_horno),
      porciones_vendidas: num(polloRow[0]?.u),
      sacos_papas_ini: num(sesion[0]?.sacos_papas_ini),
      // Conciliación fina (precocidos/merma vs horno) requiere oven_batch (pendiente F-E).
      conciliacion: 'parcial',
    },
    top: top.map((r) => ({ name: r.name, unidades: num(r.u), monto: num(r.t) })),
    stock_critico: { count: stockCriticos, items: critRows.map((r) => ({ name: r.name, unit: r.unit, stock: num(r.stock_qty), min: num(r.min_stock_qty) })) },
    incidencias: incid.map((r) => ({ action: r.action, severity: r.severity, at: r.created_at })),
    cierre_anterior: cierre[0] ? { period_end: cierre[0].period_end, diff_total: num(cierre[0].diff_total), descuadre: !!cierre[0].has_descuadre } : null,
    alerts,
  });
}
