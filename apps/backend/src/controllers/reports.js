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
  const per_weekday = DOW.map((dia, dow) => {
    const arr = byDow[dow]; const n = arr.length;
    if (!n) return { dow, dia, n: 0, promedio: 0, reciente: 0, max: 0, recomendado: 0 };
    const vals = arr.map((a) => a.pollos);
    const promedio = vals.reduce((s, v) => s + v, 0) / n;
    const max = Math.max(...vals);
    // Ponderación por recencia: vida media de 4 semanas.
    let ws = 0, wsum = 0;
    for (const a of arr) { const w = Math.pow(0.5, a.ageWeeks / 4); ws += w * a.pollos; wsum += w; }
    const reciente = wsum > 0 ? ws / wsum : promedio;
    return { dow, dia, n, promedio: r1(promedio), reciente: r1(reciente), max: Math.round(max), recomendado: Math.round(reciente) };
  });

  // Próximos 7 días (desde hoy).
  const next_7_days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(now.getTime() + i * 86400000);
    const w = per_weekday[dt.getDay()];
    next_7_days.push({
      fecha: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
      dia: DOW[dt.getDay()], recomendado: w.recomendado, promedio: w.promedio, max: w.max,
      etiqueta: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : null,
    });
  }

  // Top productos de pollo (mix de presas) y su demanda media por día.
  const diasAbiertos = perDay.size || 1;
  const nameById = new Map(prods.map((p) => [p.id, p.name]));
  const por_producto = [...prodAgg.entries()]
    .map(([pid, u]) => ({ name: nameById.get(pid), unidades: u, por_dia: r1(u / diasAbiertos), pollo: frac.get(pid) }))
    .sort((a, b) => b.unidades - a.unidades).slice(0, 10);

  return res.json({
    period: { from, to }, lookback_weeks: weeks, dias_con_venta: perDay.size,
    promedio_diario: r1([...perDay.values()].reduce((s, v) => s + v, 0) / diasAbiertos),
    per_weekday, next_7_days, por_producto,
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
