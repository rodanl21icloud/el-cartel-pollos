// ============================================================
// Caja: apertura con fondo, movimientos de efectivo y Cierre CIEGO.
// El cierre calcula el teórico contra ventas, gastos y movimientos,
// pero NUNCA expone ese teórico antes de que el cajero declare.
//   efectivo_teorico = fondo + ventas_efectivo − gastos_efectivo
//                      − depósitos + ingresos
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';
import { hasPermission } from '../services/permissions.js';

const TOLERANCE = 0.0;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Conteo operativo (pollos/papas): enteros ≥ 0. Ausente/vacío => 0.
// Devuelve { out } o { error: <campo> } si un valor presente no es válido.
function parseConteo(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') { out[k] = 0; continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) return { error: k };
    out[k] = n;
  }
  return { out };
}
const obsClean = (s) => (s && String(s).trim() ? String(s).trim().slice(0, 500) : null);

async function findOpenSession(db) {
  const { rows } = await db.execute({
    sql: `SELECT id, opening_float, opened_at FROM cash_sessions WHERE status='OPEN' LIMIT 1`,
    args: [],
  });
  return rows[0] || null;
}

/** GET /api/cash-register/current — estado de la caja (CIEGO: sin teórico). */
export async function getCurrentSession(req, res) {
  const db = getDb();
  const s = await findOpenSession(db);
  if (!s) return res.json({ open: false });
  // Solo metadatos + movimientos hechos; jamás el esperado.
  const mov = await db.execute({
    sql: `SELECT type, amount, reason, created_at FROM cash_movements
          WHERE session_id = ? ORDER BY created_at`,
    args: [s.id],
  });
  return res.json({
    open: true,
    session_id: s.id,
    opening_float: Number(s.opening_float),
    opened_at: s.opened_at,
    movements: mov.rows,
  });
}

/** POST /api/cash-register/open  Body: { opening_float, detail? } */
export async function openSession(req, res) {
  const { opening_float, detail, pollos_horno, pollos_crudos_ini, sacos_papas_ini, obs_apertura } = req.body || {};
  if (typeof opening_float !== 'number' || !Number.isFinite(opening_float) || opening_float < 0) {
    return res.status(400).json({ error: 'FONDO_INVALIDO' });
  }
  // Conteo operativo de apertura (no toca inventario).
  const ap = parseConteo({ pollos_horno, pollos_crudos_ini, sacos_papas_ini });
  if (ap.error) return res.status(400).json({ error: 'CONTEO_INVALIDO', field: ap.error });
  // Si viene el desglose por denominación, debe cuadrar con el fondo declarado.
  let detailJson = null;
  if (detail && typeof detail === 'object') {
    const sum = Object.entries(detail).reduce((s, [den, qty]) => s + Number(den) * Number(qty || 0), 0);
    if (Math.round(sum) !== Math.round(opening_float)) {
      return res.status(400).json({ error: 'CONTEO_NO_CUADRA', detail: { sum, opening_float } });
    }
    detailJson = JSON.stringify(detail);
  }

  const db = getDb();
  if (await findOpenSession(db)) {
    return res.status(409).json({ error: 'CAJA_YA_ABIERTA' });
  }
  const id = randomUUID();
  // opened_at en ISO 8601 (UTC) para ser comparable con sales.sold_at,
  // que viaja como ISO desde el dispositivo. No usar datetime('now')
  // (formato con espacio) porque rompe los rangos del período.
  const openedAt = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO cash_sessions (id, opened_by, opening_float, opening_detail, opened_at,
                                     pollos_horno, pollos_crudos_ini, sacos_papas_ini, obs_apertura)
          VALUES (?,?,?,?,?, ?,?,?,?)`,
    args: [id, req.user.id, opening_float, detailJson, openedAt,
           ap.out.pollos_horno, ap.out.pollos_crudos_ini, ap.out.sacos_papas_ini, obsClean(obs_apertura)],
  });
  await writeAudit({
    userId: req.user.id, action: 'CASH_OPEN', entity: 'cash_sessions', entityId: id,
    severity: 'INFO', ip: req.ip, metadata: { opening_float, conteo: ap.out },
  });
  return res.status(201).json({ session_id: id, opening_float, opened_at: openedAt });
}

/** POST /api/cash-register/movement  Body: { type, amount, reason } */
export async function registerMovement(req, res) {
  const { type, amount, reason } = req.body || {};
  if (!['DEPOSITO', 'INGRESO'].includes(type)) return res.status(400).json({ error: 'TIPO_INVALIDO' });
  if (typeof amount !== 'number' || !(amount > 0)) return res.status(400).json({ error: 'MONTO_INVALIDO' });
  if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'MOTIVO_OBLIGATORIO' });

  const db = getDb();
  const s = await findOpenSession(db);
  if (!s) return res.status(409).json({ error: 'CAJA_CERRADA' });

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO cash_movements (id, session_id, user_id, type, amount, reason) VALUES (?,?,?,?,?,?)`,
    args: [id, s.id, req.user.id, type, amount, String(reason).trim()],
  });
  await writeAudit({
    userId: req.user.id, action: `CASH_${type}`, entity: 'cash_movements', entityId: id,
    severity: 'INFO', ip: req.ip, metadata: { amount, reason },
  });
  return res.status(201).json({ movement_id: id, type, amount });
}

/**
 * POST /api/cash-register/close
 * Body: { efectivo_declarado, pos_declarado, transferencias_declaradas }
 */
export async function closeCashRegister(req, res) {
  const { efectivo_declarado, pos_declarado, transferencias_declaradas, detail,
          pollos_crudos_fin, merma_pollos, sacos_papas_fin, obs_cierre } = req.body || {};

  for (const [k, v] of Object.entries({ efectivo_declarado, pos_declarado, transferencias_declaradas })) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return res.status(400).json({ error: 'MONTO_INVALIDO', field: k });
    }
  }
  // Conteo operativo de cierre (no toca inventario).
  const ci = parseConteo({ pollos_crudos_fin, merma_pollos, sacos_papas_fin });
  if (ci.error) return res.status(400).json({ error: 'CONTEO_INVALIDO', field: ci.error });

  // Conteo de efectivo por denominación (opcional): debe cuadrar con lo declarado.
  let closingDetail = null;
  if (detail && typeof detail === 'object') {
    const sum = Object.entries(detail).reduce((s, [den, qty]) => s + Number(den) * Number(qty || 0), 0);
    if (Math.round(sum) !== Math.round(efectivo_declarado)) {
      return res.status(400).json({ error: 'CONTEO_NO_CUADRA', detail: { sum, efectivo_declarado } });
    }
    closingDetail = JSON.stringify(detail);
  }

  const db = getDb();
  const session = await findOpenSession(db);
  if (!session) return res.status(409).json({ error: 'CAJA_CERRADA' });

  const periodStart = session.opened_at;
  const periodEnd = new Date().toISOString();
  const fondo = Number(session.opening_float);

  // Ventas por método en el período.
  const ventasRes = await db.execute({
    sql: `SELECT payment_method, COALESCE(SUM(total),0) AS monto
          FROM sales WHERE status='CONFIRMADA' AND sold_at >= ? AND sold_at <= ?
          GROUP BY payment_method`,
    args: [periodStart, periodEnd],
  });
  const ventas = byMethod(ventasRes.rows);

  // Gastos por método en el período.
  const gastosRes = await db.execute({
    sql: `SELECT payment_method, COALESCE(SUM(amount),0) AS monto
          FROM expenses WHERE spent_at >= ? AND spent_at <= ?
          GROUP BY payment_method`,
    args: [periodStart, periodEnd],
  });
  const gastos = byMethod(gastosRes.rows);

  // Movimientos de efectivo de la sesión.
  const movRes = await db.execute({
    sql: `SELECT type, COALESCE(SUM(amount),0) AS monto FROM cash_movements
          WHERE session_id = ? GROUP BY type`,
    args: [session.id],
  });
  let depositos = 0, ingresos = 0;
  for (const m of movRes.rows) {
    if (m.type === 'DEPOSITO') depositos = Number(m.monto);
    if (m.type === 'INGRESO') ingresos = Number(m.monto);
  }
  const movimientos_efectivo = round2(ingresos - depositos); // neto sobre la caja

  // TEÓRICO por método.
  // Solo los gastos en EFECTIVO afectan la caja física (se sacan billetes).
  // Gastos por POS/transferencia salen del banco -> van al flujo de caja,
  // no a la cuadratura del cajón. POS/transfer se cuadran contra ventas.
  const efectivo_teorico = round2(fondo + ventas.EFECTIVO - gastos.EFECTIVO + movimientos_efectivo);
  const pos_teorico = round2(ventas.POS);
  const transferencias_teorico = round2(ventas.TRANSFERENCIA);

  // DIFERENCIAS (declarado − teórico).
  const diff_efectivo = round2(efectivo_declarado - efectivo_teorico);
  const diff_pos = round2(pos_declarado - pos_teorico);
  const diff_transferencias = round2(transferencias_declaradas - transferencias_teorico);
  const diff_total = round2(diff_efectivo + diff_pos + diff_transferencias);

  const has_descuadre =
    Math.abs(diff_efectivo) > TOLERANCE ||
    Math.abs(diff_pos) > TOLERANCE ||
    Math.abs(diff_transferencias) > TOLERANCE;

  const id = randomUUID();
  await db.batch([
    {
      sql: `INSERT INTO cash_register_closures (
              id, user_id, session_id, period_start, period_end, opening_float,
              efectivo_declarado, pos_declarado, transferencias_declarado, closing_detail,
              ventas_efectivo, gastos_efectivo, movimientos_efectivo,
              efectivo_teorico, pos_teorico, transferencias_teorico,
              diff_efectivo, diff_pos, diff_transferencias, diff_total, has_descuadre,
              pollos_crudos_fin, merma_pollos, sacos_papas_fin, obs_cierre
            ) VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?,?, ?,?,?,?)`,
      args: [
        id, req.user.id, session.id, periodStart, periodEnd, fondo,
        efectivo_declarado, pos_declarado, transferencias_declaradas, closingDetail,
        ventas.EFECTIVO, gastos.EFECTIVO, movimientos_efectivo,
        efectivo_teorico, pos_teorico, transferencias_teorico,
        diff_efectivo, diff_pos, diff_transferencias, diff_total, has_descuadre ? 1 : 0,
        ci.out.pollos_crudos_fin, ci.out.merma_pollos, ci.out.sacos_papas_fin, obsClean(obs_cierre),
      ],
    },
    {
      sql: `UPDATE cash_sessions SET status='CLOSED', closed_at=?, closure_id=? WHERE id=?`,
      args: [periodEnd, id, session.id],
    },
    {
      sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
            VALUES (?,?, 'CASH_CLOSE', 'cash_register_closures', ?, ?, ?, ?)`,
      args: [randomUUID(), req.user.id, id, has_descuadre ? 'ALERT' : 'INFO',
             JSON.stringify({ diff_total, has_descuadre, fondo, conteo_cierre: ci.out }), req.ip || null],
    },
  ], 'write');

  // El RESUMEN del turno (teórico, ventas, gastos, descuadre) solo se revela
  // a quien tenga permiso `reports.view` (gerencia). El cajero cierra a ciegas
  // y recibe únicamente la confirmación.
  const canSummary = await hasPermission(req.user.role, 'reports.view');
  if (!canSummary) {
    return res.status(201).json({ closure_id: id, closed: true, blind: true });
  }

  const total_ventas = round2(ventas.EFECTIVO + ventas.POS + ventas.TRANSFERENCIA);
  const total_gastos = round2(gastos.EFECTIVO + gastos.POS + gastos.TRANSFERENCIA);
  return res.status(201).json({
    closure_id: id,
    period: { start: periodStart, end: periodEnd },
    opening_float: fondo,
    declarado: { efectivo: efectivo_declarado, pos: pos_declarado, transferencias: transferencias_declaradas },
    teorico: { efectivo: efectivo_teorico, pos: pos_teorico, transferencias: transferencias_teorico },
    componentes: {
      ventas_efectivo: ventas.EFECTIVO, gastos_efectivo: gastos.EFECTIVO,
      movimientos_efectivo, ventas_pos: ventas.POS, ventas_transferencia: ventas.TRANSFERENCIA,
    },
    resumen_turno: { total_ventas, total_gastos, balance: round2(total_ventas - total_gastos) },
    diferencias: { efectivo: diff_efectivo, pos: diff_pos, transferencias: diff_transferencias, total: diff_total },
    descuadre: has_descuadre,
  });
}

function byMethod(rows) {
  const out = { EFECTIVO: 0, POS: 0, TRANSFERENCIA: 0 };
  for (const r of rows) out[r.payment_method] = Number(r.monto);
  return out;
}
