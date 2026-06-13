// ============================================================
// Lectura de la auditoría (audit_logs append-only). Solo lectura.
// Requiere permiso audit.view (administración).
// ============================================================
import { getDb } from '../db.js';
import { verifyAuditChain } from '../services/audit.js';

/** GET /api/audit/verify — verifica la integridad de la cadena antifraude. */
export async function auditVerify(_req, res) {
  return res.json(await verifyAuditChain());
}

// Acciones consideradas "sensibles" para el filtro rápido de la UI.
const SENSITIVE = [
  'LOGIN_FAIL', 'SALE_VOID', 'SALE_BACKDATE', 'STOCK_AJUSTE', 'STOCK_PIN_REJECT', 'HMAC_REJECT',
  'OTP_REJECT', 'OTP_MISSING', 'PERMISSION_UPDATE', 'ADMIN_PIN_SET', 'CASH_CLOSE',
  'USER_CREATE', 'USER_UPDATE', 'USER_PASSWORD_RESET', 'INV_MERMA',
];

/** GET /api/audit?from=&to=&severity=&action=&q=&sensitive=&limit= */
export async function listAudit(req, res) {
  const db = getDb();
  const { from, to, severity, action, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const cl = []; const args = [];
  if (from) { cl.push('a.created_at >= ?'); args.push(from); }
  if (to) { cl.push('a.created_at <= ?'); args.push(to); }
  if (severity) { cl.push('a.severity = ?'); args.push(severity); }
  if (action) { cl.push('a.action = ?'); args.push(action); }
  if (req.query.sensitive === '1') { cl.push(`a.action IN (${SENSITIVE.map(() => '?').join(',')})`); args.push(...SENSITIVE); }
  if (q && q.trim()) { cl.push('(a.action LIKE ? OR a.entity LIKE ? OR a.metadata LIKE ?)'); const t = `%${q.trim()}%`; args.push(t, t, t); }
  const where = cl.length ? `WHERE ${cl.join(' AND ')}` : '';

  const { rows } = await db.execute({
    sql: `SELECT a.id, a.action, a.entity, a.entity_id, a.severity, a.metadata, a.ip_address, a.created_at,
                 u.username, u.full_name, u.role
          FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
          ${where} ORDER BY a.created_at DESC LIMIT ${limit}`,
    args,
  });

  return res.json(rows.map((r) => ({
    id: r.id, action: r.action, entity: r.entity, entity_id: r.entity_id,
    severity: r.severity, created_at: r.created_at, ip: r.ip_address,
    user: r.username ? { username: r.username, name: r.full_name, role: r.role } : null,
    metadata: r.metadata ? safeJson(r.metadata) : null,
  })));
}

/** GET /api/audit/actions — catálogo de acciones para el filtro. */
export async function auditActions(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({ sql: `SELECT DISTINCT action FROM audit_logs ORDER BY action`, args: [] });
  return res.json({ actions: rows.map((r) => r.action), sensitive: SENSITIVE });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }
