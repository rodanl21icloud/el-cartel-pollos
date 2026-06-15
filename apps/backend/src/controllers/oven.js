// ============================================================
// Producción de pollo del turno (oven_batch). Registrar lotes enviados al horno
// o precocidos para mañana, y listar los del día con agregados. Permiso:
// dispatch.manage (cocina). Audita OVEN_BATCH.
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { chileBusinessDay } from '../services/sales.js';
import { writeAudit } from '../services/audit.js';

const KINDS = new Set(['HORNO', 'PRECOCIDO']);

/** POST /api/oven — registra un lote { kind, qty, note }. */
export async function registerOvenBatch(req, res) {
  const { kind, qty, note } = req.body || {};
  if (!KINDS.has(kind)) return res.status(400).json({ error: 'TIPO_INVALIDO' });
  const n = Number(qty);
  if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: 'CANTIDAD_INVALIDA' });

  const db = getDb();
  const day = chileBusinessDay();
  const ses = (await db.execute({ sql: `SELECT id FROM cash_sessions WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 1`, args: [] })).rows[0];
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO oven_batch (id, session_id, user_id, business_day, kind, qty, note) VALUES (?,?,?,?,?,?,?)`,
    args: [id, ses?.id || null, req.user.id, day, kind, n, note ? String(note).trim() : null],
  });
  await writeAudit({ userId: req.user.id, action: 'OVEN_BATCH', entity: 'oven_batch', entityId: id, severity: 'INFO', ip: req.ip, metadata: { kind, qty: n } });
  return res.status(201).json({ id, kind, qty: n, business_day: day });
}

/** GET /api/oven/today — lotes del día + agregados (horno / precocido). */
export async function ovenToday(_req, res) {
  const db = getDb();
  const day = chileBusinessDay();
  const rows = (await db.execute({
    sql: `SELECT b.id, b.kind, b.qty, b.note, b.created_at, u.full_name AS usuario
          FROM oven_batch b LEFT JOIN users u ON u.id=b.user_id
          WHERE b.business_day=? ORDER BY b.created_at DESC`, args: [day],
  })).rows;
  const sum = (k) => rows.filter((r) => r.kind === k).reduce((s, r) => s + Number(r.qty), 0);
  return res.json({
    day,
    horno: sum('HORNO'),
    precocido: sum('PRECOCIDO'),
    batches: rows.map((r) => ({ id: r.id, kind: r.kind, qty: Number(r.qty), note: r.note, at: r.created_at, usuario: r.usuario })),
  });
}
