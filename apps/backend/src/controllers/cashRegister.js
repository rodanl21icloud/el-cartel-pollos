// ============================================================
// Controlador: Cierre de Caja CIEGO.
// El frontend envía SOLO 3 valores declarados. El backend calcula
// el teórico contra `sales` y persiste la diferencia + alerta.
// El total teórico esperado NUNCA se devuelve antes del cierre.
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

// Umbral de tolerancia (en moneda) para no marcar descuadre por redondeo.
const TOLERANCE = 0.0;

/**
 * GET /api/cash-register/open-period
 * Devuelve SOLO la marca de inicio del turno. Sin totales teóricos.
 */
export async function getOpenPeriod(req, res) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT MAX(period_end) AS last_close FROM cash_register_closures`,
    args: [],
  });
  const periodStart = rows[0]?.last_close ?? null;
  return res.json({ period_start: periodStart, server_now: new Date().toISOString() });
}

/**
 * POST /api/cash-register/close
 * Body: { efectivo_declarado, pos_declarado, transferencias_declaradas }
 */
export async function closeCashRegister(req, res) {
  const {
    efectivo_declarado,
    pos_declarado,
    transferencias_declaradas,
  } = req.body || {};

  // Validación Poka-yoke: solo se aceptan los 3 montos, numéricos y >= 0.
  for (const [k, v] of Object.entries({
    efectivo_declarado,
    pos_declarado,
    transferencias_declaradas,
  })) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      return res.status(400).json({ error: 'MONTO_INVALIDO', field: k });
    }
  }

  const db = getDb();

  // Periodo: desde el último cierre (o inicio del día) hasta ahora.
  const periodRes = await db.execute({
    sql: `SELECT COALESCE(MAX(period_end), datetime('now','start of day')) AS start
          FROM cash_register_closures`,
    args: [],
  });
  const periodStart = periodRes.rows[0].start;
  const periodEnd = new Date().toISOString();

  // TEÓRICO: suma de ventas confirmadas del periodo, desglosada por método.
  const theoRes = await db.execute({
    sql: `
      SELECT
        COALESCE(SUM(CASE WHEN payment_method='EFECTIVO'      THEN total END), 0) AS efectivo,
        COALESCE(SUM(CASE WHEN payment_method='POS'           THEN total END), 0) AS pos,
        COALESCE(SUM(CASE WHEN payment_method='TRANSFERENCIA' THEN total END), 0) AS transferencias
      FROM sales
      WHERE status = 'CONFIRMADA'
        AND sold_at >= ? AND sold_at <= ?`,
    args: [periodStart, periodEnd],
  });
  const t = theoRes.rows[0];
  const efectivo_teorico = Number(t.efectivo);
  const pos_teorico = Number(t.pos);
  const transferencias_teorico = Number(t.transferencias);

  // DIFERENCIAS (declarado - teórico). Negativo = falta dinero.
  const diff_efectivo = round2(efectivo_declarado - efectivo_teorico);
  const diff_pos = round2(pos_declarado - pos_teorico);
  const diff_transferencias = round2(transferencias_declaradas - transferencias_teorico);
  const diff_total = round2(diff_efectivo + diff_pos + diff_transferencias);

  const has_descuadre =
    Math.abs(diff_efectivo) > TOLERANCE ||
    Math.abs(diff_pos) > TOLERANCE ||
    Math.abs(diff_transferencias) > TOLERANCE;

  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO cash_register_closures (
            id, user_id, period_start, period_end,
            efectivo_declarado, pos_declarado, transferencias_declarado,
            efectivo_teorico, pos_teorico, transferencias_teorico,
            diff_efectivo, diff_pos, diff_transferencias, diff_total,
            has_descuadre
          ) VALUES (?,?,?,?, ?,?,?, ?,?,?, ?,?,?,?, ?)`,
    args: [
      id, req.user.id, periodStart, periodEnd,
      efectivo_declarado, pos_declarado, transferencias_declaradas,
      efectivo_teorico, pos_teorico, transferencias_teorico,
      diff_efectivo, diff_pos, diff_transferencias, diff_total,
      has_descuadre ? 1 : 0,
    ],
  });

  await writeAudit({
    userId: req.user.id,
    action: 'CASH_CLOSE',
    entity: 'cash_register_closures',
    entityId: id,
    severity: has_descuadre ? 'ALERT' : 'INFO',
    ip: req.ip,
    metadata: { diff_total, has_descuadre, periodStart, periodEnd },
  });

  // RESPUESTA: tras el cierre ya se puede revelar el resultado.
  // Antes del cierre el frontend jamás recibió el teórico.
  return res.status(201).json({
    closure_id: id,
    period: { start: periodStart, end: periodEnd },
    declarado: {
      efectivo: efectivo_declarado,
      pos: pos_declarado,
      transferencias: transferencias_declaradas,
    },
    teorico: {
      efectivo: efectivo_teorico,
      pos: pos_teorico,
      transferencias: transferencias_teorico,
    },
    diferencias: {
      efectivo: diff_efectivo,
      pos: diff_pos,
      transferencias: diff_transferencias,
      total: diff_total,
    },
    descuadre: has_descuadre,
  });
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
