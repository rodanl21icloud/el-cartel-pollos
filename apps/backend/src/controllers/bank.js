// ============================================================
// Conciliación bancaria. Movimientos de la cuenta (cartola o manuales),
// resumen por categoría/contraparte, y comparación con el sistema (POS).
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** GET /api/bank/summary?from=&to= — saldo, ingresos/egresos, por categoría y mes. */
export async function bankSummary(req, res) {
  const db = getDb();
  const to = req.query.to || '2999-12-31';
  const from = req.query.from || '0000-01-01';
  const where = `fecha >= ? AND fecha <= ?`; const args = [from, to];

  const dir = (await db.execute({ sql: `SELECT direction, COUNT(*) n, COALESCE(SUM(amount),0) t FROM bank_movements WHERE ${where} GROUP BY direction`, args })).rows;
  const ingresos = Number(dir.find((d) => d.direction === 'INGRESO')?.t || 0);
  const egresos = Number(dir.find((d) => d.direction === 'EGRESO')?.t || 0);

  const cats = (await db.execute({ sql: `SELECT category, direction, COALESCE(SUM(amount),0) t, COUNT(*) n FROM bank_movements WHERE ${where} GROUP BY category, direction ORDER BY t DESC`, args })).rows;
  const top = (await db.execute({ sql: `SELECT counterpart, COALESCE(SUM(amount),0) t, COUNT(*) n FROM bank_movements WHERE ${where} AND direction='EGRESO' AND counterpart IS NOT NULL GROUP BY counterpart ORDER BY t DESC LIMIT 12`, args })).rows;
  const meses = (await db.execute({ sql: `SELECT substr(fecha,1,7) mes,
            COALESCE(SUM(CASE WHEN direction='INGRESO' THEN amount END),0) ing,
            COALESCE(SUM(CASE WHEN direction='EGRESO' THEN amount END),0) egr
          FROM bank_movements WHERE ${where} GROUP BY mes ORDER BY mes`, args })).rows;

  const st = (await db.execute({ sql: `SELECT bank_balance, bank_balance_date FROM business_settings WHERE id=1`, args: [] })).rows[0] || {};

  return res.json({
    saldo: st.bank_balance != null ? Number(st.bank_balance) : null,
    saldo_fecha: st.bank_balance_date || null,
    ingresos: round2(ingresos), egresos: round2(egresos), neto: round2(ingresos - egresos),
    por_categoria: cats.map((c) => ({ category: c.category, direction: c.direction, monto: Number(c.t), n: Number(c.n) })),
    top_egresos: top.map((c) => ({ counterpart: c.counterpart, monto: Number(c.t), n: Number(c.n) })),
    por_mes: meses.map((m) => ({ mes: m.mes, ingresos: Number(m.ing), egresos: Number(m.egr), neto: Number(m.ing) - Number(m.egr) })),
  });
}

/** GET /api/bank/movements?from=&to=&dir=&q=&limit= */
export async function bankMovements(req, res) {
  const db = getDb();
  const { from, to, dir, q } = req.query;
  const cl = []; const args = [];
  if (from) { cl.push('fecha >= ?'); args.push(from); }
  if (to) { cl.push('fecha <= ?'); args.push(to); }
  if (dir) { cl.push('direction = ?'); args.push(dir); }
  if (q) { cl.push('(description LIKE ? OR counterpart LIKE ? OR category LIKE ?)'); const t = `%${q}%`; args.push(t, t, t); }
  const where = cl.length ? `WHERE ${cl.join(' AND ')}` : '';
  const { rows } = await db.execute({
    sql: `SELECT id, fecha, amount, direction, description, counterpart, category, reconciled, source
          FROM bank_movements ${where} ORDER BY fecha DESC, created_at DESC LIMIT ${Math.min(Number(req.query.limit) || 300, 1000)}`,
    args,
  });
  return res.json(rows.map((r) => ({ ...r, amount: Number(r.amount), reconciled: !!r.reconciled })));
}

/** POST /api/bank/movements — registrar movimiento manual. */
export async function addBankMovement(req, res) {
  const { fecha, amount, direction, description, counterpart, category } = req.body || {};
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'FECHA_INVALIDA' });
  if (typeof amount !== 'number' || !(amount > 0)) return res.status(400).json({ error: 'MONTO_INVALIDO' });
  if (!['INGRESO', 'EGRESO'].includes(direction)) return res.status(400).json({ error: 'DIRECCION_INVALIDA' });
  const db = getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO bank_movements (id, fecha, amount, direction, description, counterpart, category, source, created_by)
          VALUES (?,?,?,?,?,?,?, 'MANUAL', ?)`,
    args: [id, fecha, amount, direction, (description || '').trim() || null, (counterpart || '').trim() || null, (category || 'Otros').trim(), req.user.id],
  });
  await writeAudit({ userId: req.user.id, action: 'BANK_MOVEMENT', entity: 'bank_movements', entityId: id, severity: 'INFO', ip: req.ip, metadata: { amount, direction } });
  return res.status(201).json({ id, fecha, amount, direction });
}

/** PUT /api/bank/movements/:id/reconcile  Body: { reconciled } */
export async function reconcileMovement(req, res) {
  const db = getDb();
  const { reconciled } = req.body || {};
  await db.execute({ sql: `UPDATE bank_movements SET reconciled = ? WHERE id = ?`, args: [reconciled ? 1 : 0, req.params.id] });
  return res.json({ id: req.params.id, reconciled: !!reconciled });
}

/**
 * GET /api/bank/reconcile?from=&to= — compara banco vs sistema por mes.
 * Ingresos banco (transferencias) vs ventas TRANSFERENCIA del POS;
 * egresos banco vs gastos del sistema.
 */
export async function reconcile(req, res) {
  const db = getDb();
  const to = req.query.to || '2999-12-31', from = req.query.from || '0000-01-01';
  const bank = (await db.execute({
    sql: `SELECT substr(fecha,1,7) mes,
            COALESCE(SUM(CASE WHEN direction='INGRESO' THEN amount END),0) banco_ing,
            COALESCE(SUM(CASE WHEN direction='EGRESO' THEN amount END),0) banco_egr
          FROM bank_movements WHERE fecha>=? AND fecha<=? GROUP BY mes`, args: [from, to],
  })).rows;
  const sysV = (await db.execute({
    sql: `SELECT substr(sold_at,1,7) mes,
            COALESCE(SUM(CASE WHEN payment_method IN ('POS','TRANSFERENCIA') THEN total END),0) sis_digital,
            COALESCE(SUM(total),0) sis_ventas
          FROM sales WHERE status='CONFIRMADA' GROUP BY mes`, args: [],
  })).rows;
  const sysG = (await db.execute({ sql: `SELECT substr(spent_at,1,7) mes, COALESCE(SUM(amount),0) sis_gastos FROM expenses GROUP BY mes`, args: [] })).rows;

  const map = new Map();
  const get = (mes) => { if (!map.has(mes)) map.set(mes, { mes, banco_ing: 0, banco_egr: 0, sis_digital: 0, sis_ventas: 0, sis_gastos: 0 }); return map.get(mes); };
  bank.forEach((r) => { const x = get(r.mes); x.banco_ing = Number(r.banco_ing); x.banco_egr = Number(r.banco_egr); });
  sysV.forEach((r) => { const x = get(r.mes); x.sis_digital = Number(r.sis_digital); x.sis_ventas = Number(r.sis_ventas); });
  sysG.forEach((r) => { const x = get(r.mes); x.sis_gastos = Number(r.sis_gastos); });

  return res.json([...map.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map((x) => ({
    ...x, dif_ingresos: round2(x.banco_ing - x.sis_digital), dif_egresos: round2(x.banco_egr - x.sis_gastos),
  })));
}
