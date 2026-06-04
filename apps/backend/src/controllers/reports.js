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
 * GET /api/reports/consumo-insumos?from=&to= — Consumo del período por receta.
 * Lee el descuento real de insumos al vender (inventory_adjustments type='VENTA').
 * Devuelve pollos (unidades) y papas en kg. (reports.view)
 */
export async function consumoInsumos(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const { rows } = await db.execute({
    sql: `SELECT i.name, i.unit, COALESCE(SUM(ABS(ia.qty_delta)),0) qty
          FROM inventory_adjustments ia JOIN ingredients i ON i.id = ia.ingredient_id
          WHERE ia.type='VENTA' AND datetime(ia.created_at) >= datetime(?) AND datetime(ia.created_at) <= datetime(?)
            AND (i.name LIKE '%ollo%' OR i.name LIKE '%apa%')
          GROUP BY i.id`,
    args: [from, to],
  });
  let pollos = 0, papasKg = 0;
  for (const r of rows) {
    const n = String(r.name).toLowerCase(), qty = Number(r.qty);
    if (n.includes('ollo')) pollos += qty;
    else if (n.includes('apa')) papasKg += r.unit === 'gramo' ? qty / 1000 : qty;
  }
  return res.json({ period: { from, to }, pollos: round2(pollos), papas_kg: Math.round(papasKg * 10) / 10 });
}

/**
 * GET /api/reports/precios-insumos?from=&to= — Variación de precio de compra por insumo.
 * Lee las reposiciones (inventory_adjustments type='REPOSICION') y su unit_cost real.
 * Identifica cuándo conviene comprar (último vs mín/máx histórico). (reports.view)
 */
export async function preciosInsumos(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(Date.now() - 365 * 86400000).toISOString();
  const { rows } = await db.execute({
    sql: `SELECT ia.ingredient_id, i.name, i.unit, ia.qty_delta qty, ia.unit_cost cost, ia.created_at fecha
          FROM inventory_adjustments ia JOIN ingredients i ON i.id = ia.ingredient_id
          WHERE ia.type='REPOSICION' AND datetime(ia.created_at) >= datetime(?) AND datetime(ia.created_at) <= datetime(?)
          ORDER BY ia.created_at ASC`,
    args: [from, to],
  });

  const byIng = new Map();
  for (const r of rows) {
    const m = byIng.get(r.ingredient_id) || { name: r.name, unit: r.unit, compras: [] };
    m.compras.push({ fecha: r.fecha, qty: Number(r.qty), cost_unit: round2(Number(r.cost)) });
    byIng.set(r.ingredient_id, m);
  }

  const insumos = [...byIng.values()].map((m) => {
    const costos = m.compras.map((c) => c.cost_unit);
    const min = Math.min(...costos), max = Math.max(...costos);
    const ultimo = costos[costos.length - 1];
    const anterior = costos.length > 1 ? costos[costos.length - 2] : null;
    const qtyTot = m.compras.reduce((s, c) => s + c.qty, 0);
    const gastoTot = m.compras.reduce((s, c) => s + c.qty * c.cost_unit, 0);
    const promedio_ponderado = qtyTot > 0 ? round2(gastoTot / qtyTot) : ultimo;
    const variacion_pct = anterior ? round2(((ultimo - anterior) / anterior) * 100) : null;
    const estado = ultimo <= min ? 'barato' : ultimo >= max ? 'caro' : 'medio';
    return { name: m.name, unit: m.unit, n_compras: m.compras.length, ultimo, min, max, promedio_ponderado, variacion_pct, estado, compras: m.compras };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return res.json({ period: { from, to }, insumos });
}

// ============================================================
// ESTADÍSTICAS (dashboard analítico). Comparación contra período equivalente:
// un día -> mismo día de la semana anterior; rangos -> ventana previa de igual largo.
// ============================================================
const diaSemana = (iso) => new Intl.DateTimeFormat('es-CL', { weekday: 'long', timeZone: 'America/Santiago' }).format(new Date(iso));
function rangoComparativo(from, to) {
  const f = new Date(from), t = new Date(to);
  const len = t - f;
  if (len <= 36 * 3600 * 1000) { // un día -> semana anterior (mismo día)
    return { prevFrom: new Date(f - 7 * 86400000).toISOString(), prevTo: new Date(t - 7 * 86400000).toISOString(), sameWeekday: true };
  }
  return { prevFrom: new Date(f - len).toISOString(), prevTo: new Date(f.getTime()).toISOString(), sameWeekday: false };
}
const vpct = (a, b) => (b > 0 ? round2(((a - b) / b) * 100) : null);

/** GET /api/reports/estadisticas/ventas?from=&to= — KPIs, serie horaria y ranking. (reports.view) */
export async function estadisticasVentas(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const { prevFrom, prevTo, sameWeekday } = rangoComparativo(from, to);

  const agg = async (a, b) => {
    const r = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(COALESCE(subtotal,total)),0) bruto, COALESCE(SUM(discount),0) descuentos FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [a, b] })).rows[0];
    const cogs = Number((await db.execute({ sql: `SELECT COALESCE(SUM(ABS(qty_delta)*unit_cost),0) c FROM inventory_adjustments WHERE type='VENTA' AND datetime(created_at)>=datetime(?) AND datetime(created_at)<=datetime(?)`, args: [a, b] })).rows[0].c);
    const total = Number(r.total);
    return { n: Number(r.n), total, bruto: Number(r.bruto), descuentos: Number(r.descuentos), cogs, ganancia: round2(total - cogs) };
  };
  const cur = await agg(from, to), prev = await agg(prevFrom, prevTo);
  const ticket = cur.n ? round2(cur.total / cur.n) : 0, ticketP = prev.n ? round2(prev.total / prev.n) : 0;

  const bucket = (rows) => { const h = new Array(24).fill(0); const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false }); for (const x of rows) h[parseInt(f.format(new Date(x.sold_at)), 10) % 24] += Number(x.total); return h; };
  const hc = bucket((await db.execute({ sql: `SELECT sold_at,total FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [from, to] })).rows);
  const hp = bucket((await db.execute({ sql: `SELECT sold_at,total FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [prevFrom, prevTo] })).rows);
  const serie = hc.map((v, i) => ({ hora: i, actual: round2(v), comparativo: round2(hp[i]) }));
  const horaPico = hc.some((v) => v > 0) ? hc.indexOf(Math.max(...hc)) : null;

  const rank = async (a, b) => (await db.execute({
    sql: `SELECT p.id,p.name,p.category, SUM(si.qty) u, COALESCE(SUM(si.line_total),0) t,
            COALESCE((SELECT SUM(pr.qty_per_unit*i.cost_unit) FROM product_recipes pr JOIN ingredients i ON i.id=pr.ingredient_id WHERE pr.product_id=p.id),0) costo_unit
          FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=?
          JOIN products p ON p.id=si.product_id GROUP BY p.id`, args: [a, b],
  })).rows;
  const curRank = await rank(from, to);
  const prevMap = new Map((await rank(prevFrom, prevTo)).map((r) => [r.id, Number(r.t)]));
  const totProd = curRank.reduce((s, r) => s + Number(r.t), 0) || 1;
  let costosIncompletos = false;
  const productos = curRank.map((r) => {
    const t = Number(r.t), u = Number(r.u), cu = Number(r.costo_unit);
    if (cu <= 0) costosIncompletos = true;
    const costo = round2(cu * u), gan = round2(t - costo);
    return { name: r.name, category: r.category, total_ventas: t, unidades: u, precio_prom: u ? round2(t / u) : 0, costo_total: costo, ganancia: gan, margen_pct: t > 0 ? round2(gan / t * 100) : null, participacion_pct: round2(t / totProd * 100), variacion_pct: vpct(t, prevMap.get(r.id) || 0) };
  }).sort((a, b) => b.total_ventas - a.total_ventas);
  const estrella = productos[0]?.name || null;

  const insights = [];
  const vv = vpct(cur.total, prev.total);
  if (vv != null) insights.push(`Tus ventas ${cur.total >= prev.total ? 'subieron' : 'bajaron'} ${Math.abs(vv)}% vs ${sameWeekday ? 'el ' + diaSemana(from) + ' anterior' : 'el período anterior'}`);
  if (estrella) insights.push(`Tu producto estrella fue ${estrella}`);
  if (horaPico != null) insights.push(`Tu hora pico fue cerca de las ${String(horaPico).padStart(2, '0')}:00`);
  const vg = vpct(cur.ganancia, prev.ganancia);
  if (vg != null && vv != null && vg < vv) insights.push('Tu ganancia cayó más que tus ventas; revisa costos o mix de productos');
  if (costosIncompletos) insights.push('Hay productos sin costo cargado: el margen es estimado');

  return res.json({
    period: { from, to },
    comparativo: { from: prevFrom, to: prevTo, etiqueta: sameWeekday ? `Comparado con el ${diaSemana(from)} anterior` : 'Comparado con el período anterior' },
    costos_incompletos: costosIncompletos,
    kpis: {
      total_ventas: { valor: cur.total, prev: prev.total, var: vv },
      ganancia: { valor: cur.ganancia, prev: prev.ganancia, var: vg, nota: 'Se calcula según el costo de tus productos (recetas)' },
      margen_pct: { valor: cur.total > 0 ? round2(cur.ganancia / cur.total * 100) : null },
      ticket: { valor: ticket, prev: ticketP, var: vpct(ticket, ticketP) },
      pedidos: { valor: cur.n, prev: prev.n, var: vpct(cur.n, prev.n) },
      descuentos: { valor: cur.descuentos, prev: prev.descuentos, var: vpct(cur.descuentos, prev.descuentos) },
    },
    serie, hora_pico: horaPico, productos, producto_estrella: estrella, insights,
  });
}

/** GET /api/reports/estadisticas/gastos?from=&to= — total, breakdown, serie y detalle. (reports.view) */
export async function estadisticasGastos(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const { prevFrom, prevTo, sameWeekday } = rangoComparativo(from, to);

  const sum = async (a, b) => { const r = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(amount),0) t FROM expenses WHERE datetime(spent_at)>=datetime(?) AND datetime(spent_at)<=datetime(?)`, args: [a, b] })).rows[0]; return { n: Number(r.n), total: Number(r.t) }; };
  const ventasRange = async (a, b) => Number((await db.execute({ sql: `SELECT COALESCE(SUM(total),0) t FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [a, b] })).rows[0].t);
  const cur = await sum(from, to), prev = await sum(prevFrom, prevTo);
  const ventas = await ventasRange(from, to);

  const byCat = async (a, b) => (await db.execute({ sql: `SELECT c.name categoria, c.kind, COALESCE(SUM(e.amount),0) t FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE datetime(e.spent_at)>=datetime(?) AND datetime(e.spent_at)<=datetime(?) GROUP BY c.id ORDER BY t DESC`, args: [a, b] })).rows;
  const cats = await byCat(from, to);
  const prevCat = new Map((await byCat(prevFrom, prevTo)).map((r) => [r.categoria, Number(r.t)]));
  const breakdown = cats.map((r) => ({ categoria: r.categoria, kind: r.kind, total: Number(r.t), pct: cur.total > 0 ? round2(Number(r.t) / cur.total * 100) : 0, variacion_pct: vpct(Number(r.t), prevCat.get(r.categoria) || 0) }));
  const serie = (await db.execute({ sql: `SELECT substr(spent_at,1,10) dia, COALESCE(SUM(amount),0) t FROM expenses WHERE datetime(spent_at)>=datetime(?) AND datetime(spent_at)<=datetime(?) GROUP BY dia ORDER BY dia`, args: [from, to] })).rows.map((r) => ({ dia: r.dia, total: Number(r.t) }));
  const detalle = (await db.execute({ sql: `SELECT e.spent_at fecha, c.name categoria, e.supplier proveedor, e.description descripcion, e.payment_method, e.amount FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE datetime(e.spent_at)>=datetime(?) AND datetime(e.spent_at)<=datetime(?) ORDER BY e.spent_at DESC LIMIT 100`, args: [from, to] })).rows.map((r) => ({ ...r, amount: Number(r.amount) }));

  const insights = [];
  if (breakdown[0]) insights.push(`Categoría dominante: ${breakdown[0].categoria} (${breakdown[0].pct}% del gasto)`);
  const vGastos = vpct(cur.total, prev.total), vVentas = vpct(ventas, await ventasRange(prevFrom, prevTo));
  if (vGastos != null && vVentas != null && vGastos > vVentas) insights.push('Tus gastos crecieron más rápido que tus ventas');

  return res.json({
    period: { from, to },
    comparativo: { etiqueta: sameWeekday ? `Comparado con el ${diaSemana(from)} anterior` : 'Comparado con el período anterior' },
    kpis: { total: { valor: cur.total, prev: prev.total, var: vGastos }, movimientos: cur.n, prom_diario: round2(cur.total / Math.max(1, serie.length || 1)), pct_sobre_ventas: ventas > 0 ? round2(cur.total / ventas * 100) : null },
    breakdown, serie, detalle, insights,
  });
}

/** GET /api/reports/retroactivas?from=&to= — ventas retroactivas por usuario y motivo. (reports.view) */
export async function retroactivasReport(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(Date.now() - 90 * 86400000).toISOString();
  const por_usuario = (await db.execute({
    sql: `SELECT u.full_name usuario, COUNT(*) n, COALESCE(SUM(s.total),0) total
          FROM sales s LEFT JOIN users u ON u.id = s.user_id
          WHERE s.is_backdated=1 AND datetime(s.created_at) >= datetime(?) AND datetime(s.created_at) <= datetime(?)
          GROUP BY s.user_id ORDER BY n DESC`,
    args: [from, to],
  })).rows.map((r) => ({ usuario: r.usuario || '—', n: Number(r.n), total: Number(r.total) }));
  const detalle = (await db.execute({
    sql: `SELECT s.order_number, s.sold_at, s.created_at, s.total, s.backdate_reason, u.full_name usuario
          FROM sales s LEFT JOIN users u ON u.id = s.user_id
          WHERE s.is_backdated=1 AND datetime(s.created_at) >= datetime(?) AND datetime(s.created_at) <= datetime(?)
          ORDER BY s.created_at DESC LIMIT 60`,
    args: [from, to],
  })).rows.map((r) => ({ order_number: r.order_number, sold_at: r.sold_at, created_at: r.created_at, total: Number(r.total), reason: r.backdate_reason || '—', usuario: r.usuario || '—' }));
  return res.json({ por_usuario, detalle });
}

/**
 * GET /api/reports/turnos — Cuadre operativo de turno (pollos/papas).
 * Cruza el conteo de APERTURA (cash_sessions) y CIERRE (closures) SIN tocar el
 * inventario real. Detecta descalces e indica merma excesiva según un umbral.
 *   esperado_final = pollos_crudos_ini − pollos_horno − merma_pollos
 *   descalce       = esperado_final − pollos_crudos_fin
 * (reports.view)
 */
export async function turnos(_req, res) {
  const db = getDb();
  const umbral = Number((await db.execute(`SELECT conteo_umbral FROM business_settings WHERE id=1`)).rows[0]?.conteo_umbral ?? 3);
  const { rows } = await db.execute({
    sql: `SELECT s.id, s.opened_at, s.closed_at, u.full_name AS encargado,
                 s.pollos_horno, s.pollos_crudos_ini, s.sacos_papas_ini, s.obs_apertura,
                 c.pollos_crudos_fin, c.merma_pollos, c.sacos_papas_fin, c.obs_cierre
          FROM cash_sessions s
          JOIN cash_register_closures c ON c.session_id = s.id
          LEFT JOIN users u ON u.id = s.opened_by
          WHERE s.status='CLOSED'
          ORDER BY s.closed_at DESC LIMIT 60`,
    args: [],
  });
  const lista = rows.map((r) => {
    const pollos_horno = Number(r.pollos_horno), crudos_ini = Number(r.pollos_crudos_ini);
    const merma = Number(r.merma_pollos), crudos_fin = Number(r.pollos_crudos_fin);
    const esperado_final = crudos_ini - pollos_horno - merma;
    const descalce = esperado_final - crudos_fin;
    let estado = 'OK';
    if (merma >= umbral || Math.abs(descalce) >= umbral) estado = 'PERDIDA_EXCESIVA';
    else if (descalce !== 0) estado = 'INCONSISTENCIA';
    return {
      id: r.id, opened_at: r.opened_at, closed_at: r.closed_at, encargado: r.encargado || '—',
      pollos_horno, pollos_crudos_ini: crudos_ini, pollos_crudos_fin: crudos_fin, merma_pollos: merma,
      sacos_papas_ini: Number(r.sacos_papas_ini), sacos_papas_fin: Number(r.sacos_papas_fin),
      esperado_final, descalce, variacion_papas: Number(r.sacos_papas_ini) - Number(r.sacos_papas_fin),
      estado, obs_apertura: r.obs_apertura || null, obs_cierre: r.obs_cierre || null,
    };
  });
  const tMap = new Map();
  for (const t of lista) {
    const dia = String(t.closed_at).slice(0, 10);
    const x = tMap.get(dia) || { dia, merma: 0, descalce_abs: 0, turnos: 0 };
    x.merma += t.merma_pollos; x.descalce_abs += Math.abs(t.descalce); x.turnos += 1;
    tMap.set(dia, x);
  }
  return res.json({
    umbral,
    resumen: {
      turnos: lista.length,
      con_alerta: lista.filter((t) => t.estado !== 'OK').length,
      merma_total: lista.reduce((s, t) => s + t.merma_pollos, 0),
      descalce_total: lista.reduce((s, t) => s + Math.abs(t.descalce), 0),
    },
    tendencia: [...tMap.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    turnos: lista,
  });
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
 * GET /api/reports/dashboard?from=&to=
 * Resumen ejecutivo para decisiones: KPIs del período vs período anterior,
 * tendencia mensual, top productos (volumen y margen), ventas por día de la
 * semana, y alertas (stock bajo, food cost alto). (reports.view)
 */
export async function dashboard(req, res) {
  const db = getDb();
  const toD = req.query.to ? new Date(req.query.to) : new Date();
  const fromD = req.query.from ? new Date(req.query.from) : new Date(toD.getTime() - 30 * 86400000);
  const len = toD.getTime() - fromD.getTime();
  const to = toD.toISOString(), from = fromD.toISOString();
  const prevTo = from, prevFrom = new Date(fromD.getTime() - len).toISOString();

  const ventas = async (a, b) => {
    const r = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [a, b] })).rows[0];
    return { n: Number(r.n), total: Number(r.t) };
  };
  const gastos = async (a, b) => Number((await db.execute({ sql: `SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE spent_at>=? AND spent_at<=?`, args: [a, b] })).rows[0].t);
  const cogs = async (a, b) => Number((await db.execute({ sql: `SELECT COALESCE(SUM(ABS(qty_delta)*unit_cost),0) c FROM inventory_adjustments WHERE type='VENTA' AND created_at>=? AND created_at<=?`, args: [a, b] })).rows[0].c);

  const cur = await ventas(from, to), prev = await ventas(prevFrom, prevTo);
  const gCur = await gastos(from, to), gPrev = await gastos(prevFrom, prevTo);
  const cogsCur = await cogs(from, to);
  const ticket = cur.n ? round2(cur.total / cur.n) : 0;
  const ticketPrev = prev.n ? round2(prev.total / prev.n) : 0;
  const delta = (a, b) => (b > 0 ? round2(((a - b) / b) * 100) : null);

  // Tendencia últimos 12 meses.
  const desde12 = new Date(toD.getFullYear(), toD.getMonth() - 11, 1).toISOString();
  const vMes = (await db.execute({ sql: `SELECT substr(sold_at,1,7) m, COALESCE(SUM(total),0) t, COUNT(*) n FROM sales WHERE status='CONFIRMADA' AND sold_at>=? GROUP BY m`, args: [desde12] })).rows;
  const gMes = (await db.execute({ sql: `SELECT substr(spent_at,1,7) m, COALESCE(SUM(amount),0) t FROM expenses WHERE spent_at>=? GROUP BY m`, args: [desde12] })).rows;
  const mesMap = new Map();
  vMes.forEach((r) => mesMap.set(r.m, { mes: r.m, ventas: Number(r.t), n: Number(r.n), gastos: 0 }));
  gMes.forEach((r) => { const x = mesMap.get(r.m) || { mes: r.m, ventas: 0, n: 0, gastos: 0 }; x.gastos = Number(r.t); mesMap.set(r.m, x); });
  const tendencia = [...mesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((x) => ({ ...x, utilidad: round2(x.ventas - x.gastos) }));

  // Top productos por monto (período).
  const top = (await db.execute({
    sql: `SELECT p.name, SUM(si.qty) u, COALESCE(SUM(si.line_total),0) t
          FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=?
          JOIN products p ON p.id=si.product_id GROUP BY p.id ORDER BY t DESC LIMIT 8`, args: [from, to],
  })).rows.map((r) => ({ name: r.name, unidades: Number(r.u), monto: Number(r.t) }));

  // Ventas por día de la semana (zona Chile).
  const dow = Array.from({ length: 7 }, () => ({ monto: 0, n: 0 }));
  const fmtDow = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short' });
  const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const rowsDow = (await db.execute({ sql: `SELECT sold_at, total FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [from, to] })).rows;
  for (const r of rowsDow) { const d = DOW[fmtDow.format(new Date(r.sold_at))]; dow[d].monto += Number(r.total); dow[d].n += 1; }
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((dia, i) => ({ dia, monto: round2(dow[i].monto), n: dow[i].n }));

  // Margen por producto (catálogo con receta).
  const margenes = (await db.execute({
    sql: `SELECT p.name, p.price,
            COALESCE((SELECT SUM(pr.qty_per_unit*i.cost_unit) FROM product_recipes pr JOIN ingredients i ON i.id=pr.ingredient_id WHERE pr.product_id=p.id),0) costo
          FROM products p WHERE p.is_active=1`, args: [],
  })).rows.map((r) => { const price = Number(r.price), costo = round2(Number(r.costo)); return { name: r.name, price, costo, margen: price > 0 && costo > 0 ? pct(price - costo, price) : null }; }).filter((x) => x.margen != null);
  const peoresMargen = [...margenes].sort((a, b) => a.margen - b.margen).slice(0, 5);

  // Alertas.
  const stockBajo = (await db.execute({ sql: `SELECT name FROM ingredients WHERE is_active=1 AND stock_qty<=min_stock_qty ORDER BY (stock_qty-min_stock_qty) LIMIT 10`, args: [] })).rows.map((r) => r.name);

  return res.json({
    period: { from, to },
    kpis: {
      ventas: round2(cur.total), ventas_delta: delta(cur.total, prev.total),
      n_ventas: cur.n, n_ventas_delta: delta(cur.n, prev.n),
      ticket, ticket_delta: delta(ticket, ticketPrev),
      gastos: round2(gCur), gastos_delta: delta(gCur, gPrev),
      utilidad: round2(cur.total - gCur), utilidad_delta: delta(cur.total - gCur, prev.total - gPrev),
      food_cost: pct(cogsCur, cur.total),
    },
    tendencia, top_productos: top, dias_semana: diasSemana, peores_margen: peoresMargen,
    alertas: { stock_bajo: stockBajo },
  });
}

/**
 * GET /api/reports/stats?from=&to=
 * Estadísticas operativas: total/n° ventas, ticket promedio, ventas por hora
 * (zona America/Santiago), por día, por método y ranking de productos. (reports.view)
 */
export async function stats(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Ventas (cabecera) del período para totales y bucketing horario por tz.
  const ventasRes = await db.execute({
    sql: `SELECT total, sold_at FROM sales
          WHERE status='CONFIRMADA' AND sold_at >= ? AND sold_at <= ?`,
    args: [from, to],
  });
  const n_ventas = ventasRes.rows.length;
  const total_ventas = round2(ventasRes.rows.reduce((s, r) => s + Number(r.total), 0));
  const ticket_promedio = n_ventas ? round2(total_ventas / n_ventas) : 0;

  // Bucket por HORA local (America/Santiago).
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: h, monto: 0, ventas: 0 }));
  const fmtHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false });
  const dias = new Map();
  const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });
  for (const r of ventasRes.rows) {
    const d = new Date(r.sold_at);
    let h = parseInt(fmtHour.format(d), 10) % 24;
    horas[h].monto = round2(horas[h].monto + Number(r.total));
    horas[h].ventas += 1;
    const dia = fmtDay.format(d);
    const acc = dias.get(dia) || { dia, monto: 0, ventas: 0 };
    acc.monto = round2(acc.monto + Number(r.total)); acc.ventas += 1;
    dias.set(dia, acc);
  }

  // Ventas por método.
  const metodoRes = await db.execute({
    sql: `SELECT payment_method, COUNT(*) AS ventas, COALESCE(SUM(total),0) AS monto
          FROM sales WHERE status='CONFIRMADA' AND sold_at >= ? AND sold_at <= ?
          GROUP BY payment_method`,
    args: [from, to],
  });

  // Ranking de productos (por unidades).
  const rankRes = await db.execute({
    sql: `SELECT p.name, SUM(si.qty) AS unidades, COALESCE(SUM(si.line_total),0) AS monto
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id AND s.status='CONFIRMADA' AND s.sold_at >= ? AND s.sold_at <= ?
          JOIN products p ON p.id = si.product_id
          GROUP BY p.id ORDER BY unidades DESC LIMIT 15`,
    args: [from, to],
  });

  // Comparativo con el período anterior de igual duración (estilo Treinta).
  const fromMs = new Date(from).getTime(), toMs = new Date(to).getTime();
  const len = Math.max(0, toMs - fromMs);
  const prevTo = new Date(fromMs).toISOString();
  const prevFrom = new Date(fromMs - len).toISOString();
  const prev = (await db.execute({
    sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM sales
          WHERE status='CONFIRMADA' AND sold_at >= ? AND sold_at < ?`,
    args: [prevFrom, prevTo],
  })).rows[0];
  const tPrev = Number(prev.t), nPrev = Number(prev.n);
  const delta = (a, b) => (b > 0 ? round2(((a - b) / b) * 100) : null);

  return res.json({
    period: { from, to },
    total_ventas, n_ventas, ticket_promedio,
    comparativo: {
      total_previo: round2(tPrev), n_previo: nPrev,
      delta_total: delta(total_ventas, tPrev), delta_n: delta(n_ventas, nPrev),
    },
    por_hora: horas,
    por_dia: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    por_metodo: metodoRes.rows.map((r) => ({ metodo: r.payment_method, ventas: Number(r.ventas), monto: Number(r.monto) })),
    ranking: rankRes.rows.map((r) => ({ name: r.name, unidades: Number(r.unidades), monto: Number(r.monto) })),
  });
}

// ============================================================
// GET /api/reports/movements?from=&to=&type=&q=&limit=
// Libro de movimientos unificado (ingresos = ventas, egresos = gastos) con
// KPIs de balance, ventas y gastos del período. (reports.view)
// ============================================================
export async function movements(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString();
  const type = req.query.type; // 'INGRESO' | 'EGRESO' | undefined
  const q = (req.query.q || '').trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit) || 300, 1000);

  // KPIs sobre TODO el período (no limitados).
  const v = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [from, to] })).rows[0];
  const g = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(amount),0) t FROM expenses WHERE spent_at>=? AND spent_at<=?`, args: [from, to] })).rows[0];

  const items = [];
  if (type !== 'EGRESO') {
    const rows = (await db.execute({
      sql: `SELECT s.id, s.sold_at AS fecha, s.payment_method, s.total, s.kind,
                   (SELECT GROUP_CONCAT(p.name || ' x' || si.qty, ', ') FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=s.id) detalle
            FROM sales s WHERE s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=?
            ORDER BY s.sold_at DESC LIMIT ?`,
      args: [from, to, limit],
    })).rows;
    for (const r of rows) {
      const concepto = r.kind === 'LIBRE' ? 'Venta libre' : (r.detalle || 'Venta');
      if (q && !concepto.toLowerCase().includes(q)) continue;
      items.push({ id: r.id, fecha: r.fecha, concepto, tipo: 'INGRESO', medio_pago: r.payment_method, valor: Number(r.total) });
    }
  }
  if (type !== 'INGRESO') {
    const rows = (await db.execute({
      sql: `SELECT e.id, e.spent_at AS fecha, e.payment_method, e.amount, e.description, c.name cat
            FROM expenses e JOIN expense_categories c ON c.id=e.category_id
            WHERE e.spent_at>=? AND e.spent_at<=? ORDER BY e.spent_at DESC LIMIT ?`,
      args: [from, to, limit],
    })).rows;
    for (const r of rows) {
      const concepto = r.description || r.cat;
      if (q && !concepto.toLowerCase().includes(q)) continue;
      items.push({ id: r.id, fecha: r.fecha, concepto, tipo: 'EGRESO', medio_pago: r.payment_method, valor: Number(r.amount), categoria: r.cat });
    }
  }
  items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  return res.json({
    period: { from, to },
    kpis: {
      ventas: { total: Number(v.t), n: Number(v.n) },
      gastos: { total: Number(g.t), n: Number(g.n) },
      balance: round2(Number(v.t) - Number(g.t)),
    },
    items: items.slice(0, limit),
    truncated: items.length > limit,
  });
}

// ============================================================
// GET /api/reports/export?type=ventas|movimientos|productos&from=&to=
// Descarga un reporte en CSV (separador ';' + BOM, abre directo en Excel).
// ============================================================
export async function exportReport(req, res) {
  const db = getDb();
  const to = req.query.to || new Date().toISOString();
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString();
  const type = req.query.type || 'movimientos';
  const esc = (s) => { s = String(s == null ? '' : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const fch = (iso) => { try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };

  let header = [], rows = [], name = 'reporte';
  if (type === 'ventas') {
    name = 'ventas';
    header = ['Fecha', 'N° orden', 'Detalle', 'Método', 'Total'];
    const r = (await db.execute({
      sql: `SELECT s.sold_at, s.order_number, s.payment_method, s.total, s.kind,
                   (SELECT GROUP_CONCAT(p.name || ' x' || si.qty, ', ') FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=s.id) detalle
            FROM sales s WHERE s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=? ORDER BY s.sold_at DESC LIMIT 20000`,
      args: [from, to],
    })).rows;
    rows = r.map((x) => [fch(x.sold_at), x.order_number ?? '', x.kind === 'LIBRE' ? 'Venta libre' : (x.detalle || ''), x.payment_method, Math.round(Number(x.total))]);
  } else if (type === 'productos') {
    name = 'productos';
    header = ['Producto', 'Unidades', 'Monto'];
    const r = (await db.execute({
      sql: `SELECT p.name, SUM(si.qty) u, COALESCE(SUM(si.line_total),0) m
            FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=?
            JOIN products p ON p.id=si.product_id GROUP BY p.id ORDER BY u DESC LIMIT 5000`,
      args: [from, to],
    })).rows;
    rows = r.map((x) => [x.name, Number(x.u), Math.round(Number(x.m))]);
  } else if (type === 'flujo') {
    name = 'flujo_caja';
    header = ['Día', 'Ingresos', 'Egresos', 'Neto'];
    const ing = (await db.execute({ sql: `SELECT substr(sold_at,1,10) d, COALESCE(SUM(total),0) t FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=? GROUP BY d`, args: [from, to] })).rows;
    const egr = (await db.execute({ sql: `SELECT substr(spent_at,1,10) d, COALESCE(SUM(amount),0) t FROM expenses WHERE spent_at>=? AND spent_at<=? GROUP BY d`, args: [from, to] })).rows;
    const map = new Map();
    ing.forEach((r) => map.set(r.d, { d: r.d, i: Number(r.t), e: 0 }));
    egr.forEach((r) => { const x = map.get(r.d) || { d: r.d, i: 0, e: 0 }; x.e = Number(r.t); map.set(r.d, x); });
    rows = [...map.values()].sort((a, b) => a.d.localeCompare(b.d)).map((x) => [x.d, Math.round(x.i), Math.round(x.e), Math.round(x.i - x.e)]);
  } else if (type === 'pnl') {
    name = 'estado_resultados';
    header = ['Concepto', 'Valor'];
    const ventas = Number((await db.execute({ sql: `SELECT COALESCE(SUM(total),0) t FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [from, to] })).rows[0].t);
    const cog = (await db.execute({ sql: `SELECT type, COALESCE(SUM(ABS(qty_delta)*unit_cost),0) c FROM inventory_adjustments WHERE type IN ('VENTA','MERMA') AND created_at>=? AND created_at<=? GROUP BY type`, args: [from, to] })).rows;
    const costo = Number(cog.find((r) => r.type === 'VENTA')?.c || 0), mermas = Number(cog.find((r) => r.type === 'MERMA')?.c || 0);
    const gs = (await db.execute({ sql: `SELECT c.kind, COALESCE(SUM(e.amount),0) m FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE e.spent_at>=? AND e.spent_at<=? GROUP BY c.kind`, args: [from, to] })).rows;
    let oper = 0, ret = 0; for (const g of gs) { if (g.kind === 'RETIRO') ret = Number(g.m); else oper += Number(g.m); }
    const ub = ventas - costo, uo = ub - mermas - oper;
    rows = [['Ventas', Math.round(ventas)], ['Costo de insumos (BOM)', Math.round(costo)], ['Utilidad bruta', Math.round(ub)],
            ['Mermas', Math.round(mermas)], ['Gastos operativos', Math.round(oper)], ['Utilidad operativa', Math.round(uo)],
            ['Retiros de socios', Math.round(ret)], ['Resultado después de retiros', Math.round(uo - ret)]];
  } else {
    name = 'movimientos';
    header = ['Fecha', 'Concepto', 'Tipo', 'Método', 'Valor'];
    const ventas = (await db.execute({
      sql: `SELECT s.sold_at AS fecha, s.payment_method, s.total, s.kind,
                   (SELECT GROUP_CONCAT(p.name || ' x' || si.qty, ', ') FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=s.id) detalle
            FROM sales s WHERE s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=? ORDER BY s.sold_at DESC LIMIT 20000`,
      args: [from, to],
    })).rows.map((x) => ({ fecha: x.fecha, concepto: x.kind === 'LIBRE' ? 'Venta libre' : (x.detalle || 'Venta'), tipo: 'INGRESO', met: x.payment_method, valor: Math.round(Number(x.total)) }));
    const gastos = (await db.execute({
      sql: `SELECT e.spent_at AS fecha, e.payment_method met, e.amount, e.description, c.name cat
            FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE e.spent_at>=? AND e.spent_at<=? ORDER BY e.spent_at DESC LIMIT 20000`,
      args: [from, to],
    })).rows.map((x) => ({ fecha: x.fecha, concepto: x.description || x.cat, tipo: 'EGRESO', met: x.met, valor: Math.round(Number(x.amount)) }));
    rows = [...ventas, ...gastos].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .map((x) => [fch(x.fecha), x.concepto, x.tipo, x.met, x.valor]);
  }

  const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}_${from.slice(0, 10)}_a_${to.slice(0, 10)}.csv"`);
  return res.send(csv);
}

// ============================================================
// GET /api/reports/forecast?weeks=8
// Predictor de demanda de POLLO (para planificar el horno y bajar la merma).
// Convierte cada producto a "pollos equivalentes" (receta del insumo pollo, con
// respaldo por nombre) y proyecta por día de la semana con ponderación por
// recencia (las semanas recientes pesan más). (reports.view)
// ============================================================
export async function forecast(req, res) {
  const db = getDb();
  const weeks = Math.min(Math.max(Number(req.query.weeks) || 8, 2), 26);
  const from = new Date(Date.now() - weeks * 7 * 86400000).toISOString();
  const to = new Date().toISOString();

  // Fracción de pollo por producto: receta (insumo 'pollo') + respaldo por nombre.
  const prods = (await db.execute({
    sql: `SELECT p.id, p.name,
            COALESCE((SELECT SUM(pr.qty_per_unit) FROM product_recipes pr JOIN ingredients i ON i.id=pr.ingredient_id
                      WHERE pr.product_id=p.id AND i.name LIKE '%ollo%'),0) pollo
          FROM products p`,
    args: [],
  })).rows;
  const frac = new Map();
  for (const p of prods) {
    let f = Number(p.pollo);
    if (!(f > 0)) {
      const n = String(p.name).toUpperCase();
      if (/MECHAD|VACUN|CERDO|RES\b/.test(n)) f = 0;                       // otras carnes
      else if (/1\/4|CUARTO|PRESA|BROASTER/.test(n)) f = 0.25;
      else if (/1\/2|MEDIO/.test(n)) f = 0.5;
      else if (/POLLO|ENTERO/.test(n)) f = 1;
    }
    frac.set(p.id, f);
  }

  // Unidades por (día hábil, producto) en la ventana.
  const rows = (await db.execute({
    sql: `SELECT s.business_day bd, si.product_id pid, SUM(si.qty) q
          FROM sale_items si JOIN sales s ON s.id=si.sale_id
          WHERE s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=? AND s.business_day IS NOT NULL
          GROUP BY s.business_day, si.product_id`,
    args: [from, to],
  })).rows;

  const perDay = new Map(); // business_day -> pollos equivalentes
  const prodAgg = new Map(); // pid -> unidades (solo productos con pollo)
  for (const r of rows) {
    const f = frac.get(r.pid) || 0; if (!f) continue;
    perDay.set(r.bd, (perDay.get(r.bd) || 0) + Number(r.q) * f);
    prodAgg.set(r.pid, (prodAgg.get(r.pid) || 0) + Number(r.q));
  }

  // Agrupar por día de la semana, guardando la antigüedad en semanas.
  const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const byDow = Array.from({ length: 7 }, () => []);
  const now = new Date();
  for (const [bd, pollos] of perDay) {
    const [y, mo, d] = bd.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    const ageWeeks = Math.max(0, (now - dt) / (7 * 86400000));
    byDow[dt.getDay()].push({ pollos, ageWeeks });
  }
  const r1 = (x) => Math.round(x * 10) / 10;

  // Meta de merma = nivel de servicio (cuantil). 0.5 = mínima merma (mediana);
  // 0.85 = casi sin quiebres. Ajustes opcionales por feriado y clima.
  const service = Math.min(0.95, Math.max(0.4, Number(req.query.service) || 0.65));
  const rainOn = req.query.rain !== '0';
  const holidaysOn = req.query.holidays !== '0';
  const HOLIDAY_FACTOR = 1.25, RAIN_FACTOR = 1.15, RAIN_THRESHOLD = 55;

  // Cuantil ponderado por recencia (combina tendencia + meta de servicio).
  const wq = (items, q) => {
    if (!items.length) return 0;
    const s = [...items].sort((a, b) => a.v - b.v);
    const tot = s.reduce((acc, it) => acc + it.w, 0);
    let cum = 0;
    for (const it of s) { cum += it.w; if (cum >= q * tot) return it.v; }
    return s[s.length - 1].v;
  };

  const per_weekday = DOW.map((dia, dow) => {
    const arr = byDow[dow]; const n = arr.length;
    if (!n) return { dow, dia, n: 0, promedio: 0, mediana: 0, max: 0, recomendado: 0 };
    const items = arr.map((a) => ({ v: a.pollos, w: Math.pow(0.5, a.ageWeeks / 4) }));
    const wsum = items.reduce((s, it) => s + it.w, 0);
    const promedio = items.reduce((s, it) => s + it.v * it.w, 0) / wsum;
    return {
      dow, dia, n,
      promedio: r1(promedio), mediana: Math.round(wq(items, 0.5)),
      max: Math.round(Math.max(...arr.map((a) => a.pollos))),
      recomendado: Math.round(wq(items, service)),
    };
  });

  // Feriados legales de Chile (los del período relevante).
  const HOLIDAYS = {
    '2025-09-18': 'Independencia', '2025-09-19': 'Glorias del Ejército', '2025-10-12': 'Encuentro de Dos Mundos',
    '2025-10-31': 'Iglesias Evangélicas', '2025-11-01': 'Todos los Santos', '2025-12-08': 'Inmaculada Concepción', '2025-12-25': 'Navidad',
    '2026-01-01': 'Año Nuevo', '2026-04-03': 'Viernes Santo', '2026-04-04': 'Sábado Santo', '2026-05-01': 'Día del Trabajo',
    '2026-05-21': 'Glorias Navales', '2026-06-29': 'San Pedro y San Pablo', '2026-07-16': 'Virgen del Carmen',
    '2026-08-15': 'Asunción', '2026-09-18': 'Independencia', '2026-09-19': 'Glorias del Ejército', '2026-10-12': 'Encuentro de Dos Mundos',
    '2026-10-31': 'Iglesias Evangélicas', '2026-11-01': 'Todos los Santos', '2026-12-08': 'Inmaculada Concepción', '2026-12-25': 'Navidad',
  };

  // Clima de los próximos 7 días (open-meteo, sin API key). Resiliente: si falla, se omite.
  let weather = null, weather_ok = false;
  if (rainOn && process.env.NODE_ENV !== 'serverless' && process.env.NODE_ENV !== 'test') {
    try {
      const lat = Number(req.query.lat) || -33.4489, lon = Number(req.query.lon) || -70.6693; // Santiago por defecto
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 3500);
      const wr = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_probability_max,temperature_2m_max&timezone=America%2FSantiago&forecast_days=7`, { signal: ctrl.signal });
      clearTimeout(tm);
      if (wr.ok) {
        const j = await wr.json();
        weather = {};
        (j.daily?.time || []).forEach((d, i) => { weather[d] = { rain: j.daily.precipitation_probability_max?.[i] ?? null, temp: j.daily.temperature_2m_max?.[i] ?? null }; });
        weather_ok = true;
      }
    } catch { weather_ok = false; }
  }

  // Próximos 7 días con ajustes por feriado/clima.
  const next_7_days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(now.getTime() + i * 86400000);
    const fecha = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const w = per_weekday[dt.getDay()];
    const base = w.recomendado;
    let factor = 1; const ajustes = [];
    const feriado = holidaysOn ? (HOLIDAYS[fecha] || null) : null;
    if (feriado) { factor *= HOLIDAY_FACTOR; ajustes.push(`Feriado +${Math.round((HOLIDAY_FACTOR - 1) * 100)}%`); }
    const wx = weather?.[fecha] || null;
    if (wx && wx.rain != null && wx.rain >= RAIN_THRESHOLD) { factor *= RAIN_FACTOR; ajustes.push(`Lluvia +${Math.round((RAIN_FACTOR - 1) * 100)}%`); }
    next_7_days.push({
      fecha, dia: DOW[dt.getDay()], etiqueta: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : null,
      base, recomendado: Math.round(base * factor), feriado,
      rain_prob: wx?.rain ?? null, temp_max: wx?.temp ?? null, ajustes,
    });
  }

  // Top productos de pollo (mix de presas) y su demanda media por día.
  const diasAbiertos = perDay.size || 1;
  const nameById = new Map(prods.map((p) => [p.id, p.name]));
  const por_producto = [...prodAgg.entries()]
    .map(([pid, u]) => ({ name: nameById.get(pid), unidades: u, por_dia: r1(u / diasAbiertos), pollo: frac.get(pid) }))
    .sort((a, b) => b.unidades - a.unidades).slice(0, 10);

  // --- Demanda de pollo por HORA (zona Chile) y PLAN DE HORNEADO de hoy ---
  // La forma horaria se calcula SOLO con ventas reales del POS (se excluyen las
  // importadas, que no traen hora). Si aún no hay señal suficiente, se usa un
  // patrón típico de almuerzo/cena (estimado) que se auto-corrige con el uso.
  const hourRows = (await db.execute({
    sql: `SELECT s.sold_at, si.product_id pid, si.qty q
          FROM sale_items si JOIN sales s ON s.id=si.sale_id
          WHERE s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=?
            AND (s.payload_hash IS NULL OR s.payload_hash NOT IN ('IMPORT','IMPORT-2025')) LIMIT 50000`,
    args: [from, to],
  })).rows;
  const fmtHour = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false });
  const realHour = new Array(24).fill(0);
  for (const r of hourRows) {
    const f = frac.get(r.pid) || 0; if (!f) continue;
    realHour[parseInt(fmtHour.format(new Date(r.sold_at)), 10) % 24] += Number(r.q) * f;
  }
  const realSignal = realHour.reduce((a, b) => a + b, 0);

  // Patrón por defecto (negocio de pollo en Chile): peaks de almuerzo y cena.
  const DEFAULT_SHAPE = { 11: 4, 12: 10, 13: 16, 14: 15, 15: 9, 16: 4, 17: 3, 18: 5, 19: 9, 20: 13, 21: 10, 22: 5, 23: 2 };
  let shapeArr = new Array(24).fill(0); let hora_fuente;
  if (realSignal >= 15) { shapeArr = realHour.map((v) => v / realSignal); hora_fuente = 'historial'; }
  else { for (const [h, v] of Object.entries(DEFAULT_SHAPE)) shapeArr[h] = v; const t = shapeArr.reduce((a, b) => a + b, 0); shapeArr = shapeArr.map((v) => v / t); hora_fuente = 'estimado'; }

  const roast = Math.min(Math.max(Number(req.query.roast) || 75, 20), 180); // min de cocción
  const cap = Math.max(0, Number(req.query.capacity) || 0);                  // capacidad por tanda (0 = sin límite)
  const todayTarget = next_7_days[0].recomendado;
  const demandByHour = shapeArr.map((s) => s * todayTarget);
  const por_hora = demandByHour.map((d, h) => ({ hora: h, pollos: r1(d) }));

  const minToHHMM = (m) => { m = Math.max(0, Math.round(m)); const hh = Math.floor(m / 60) % 24, mm = m % 60; return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };

  // Tandas por VENTANA de servicio (almuerzo / cena): práctica real de un asado.
  // Cada tanda queda lista cuando la ventana empieza a moverse (antes del peak),
  // partiendo en sub-tandas si supera la capacidad del horno.
  const WINDOWS = [{ name: 'Almuerzo', from: 10, to: 16 }, { name: 'Cena', from: 17, to: 23 }];
  const horneadas = [];
  if (todayTarget > 0) {
    for (const win of WINDOWS) {
      let dem = 0, peakH = win.from, peakD = 0;
      for (let h = win.from; h <= win.to; h++) { dem += demandByHour[h]; if (demandByHour[h] > peakD) { peakD = demandByHour[h]; peakH = h; } }
      let n = Math.ceil(dem);
      if (n <= 0 || peakD <= 0) continue;
      // Hora de inicio del servicio: primera hora que alcanza el 25% del peak.
      let ramp = peakH;
      for (let h = win.from; h <= win.to; h++) { if (demandByHour[h] >= 0.25 * peakD) { ramp = h; break; } }
      let ready = ramp;
      while (n > 0) {
        const size = cap > 0 ? Math.min(cap, n) : n; n -= size;
        horneadas.push({ ventana: win.name, poner: minToHHMM(ready * 60 - roast), lista: minToHHMM(ready * 60), pollos: size });
        ready += 2; // sub-tandas escalonadas cada 2 h
      }
    }
  }
  const peakHour = demandByHour.indexOf(Math.max(...demandByHour));

  return res.json({
    period: { from, to }, lookback_weeks: weeks, dias_con_venta: perDay.size, service, weather_ok,
    promedio_diario: r1([...perDay.values()].reduce((s, v) => s + v, 0) / diasAbiertos),
    per_weekday, next_7_days, por_producto,
    por_hora, hora_peak: peakHour, hora_fuente,
    plan_hoy: { fecha: next_7_days[0].fecha, total: todayTarget, roast_min: roast, fuente: hora_fuente, horneadas },
  });
}

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

  // --- Contraste con la REALIDAD BANCARIA del período ---
  // Los egresos del banco reflejan el costo real (insumos, proveedores, servicios)
  // que muchas veces NO está registrado como gasto en el sistema. Los retiros de
  // socios se separan (no son costo operativo).
  const bFecha = (s) => s.slice(0, 10); // bank_movements.fecha es 'YYYY-MM-DD'
  const bankRows = (await db.execute({
    sql: `SELECT direction, category, COALESCE(SUM(amount),0) t
          FROM bank_movements WHERE fecha >= ? AND fecha <= ?
          GROUP BY direction, category`,
    args: [bFecha(from), bFecha(to)],
  })).rows;
  let banco_ingresos = 0, banco_egresos_oper = 0, banco_retiros = 0;
  for (const r of bankRows) {
    const t = Number(r.t);
    if (r.direction === 'INGRESO') banco_ingresos += t;
    else if (/retiro|socio/i.test(r.category || '')) banco_retiros += t;
    else banco_egresos_oper += t;
  }
  const tiene_banco = bankRows.length > 0;
  const utilidad_real = round2(ventas - banco_egresos_oper);

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
    banco: tiene_banco ? {
      ingresos: round2(banco_ingresos),
      egresos_operativos: round2(banco_egresos_oper),
      retiros: round2(banco_retiros),
      utilidad_real,
      utilidad_real_pct: pct(utilidad_real, ventas),
      gastos_no_registrados: round2(banco_egresos_oper - gastos_operativos), // banco vs sistema
    } : null,
  });
}
