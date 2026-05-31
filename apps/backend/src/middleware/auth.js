// ============================================================
// Middleware de Autorización Estricta (Zero Trust)
// - JWT obligatorio en todo endpoint protegido.
// - CAJERO / PREPARADOR NO pueden DELETE/PUT sin OTP de GERENCIA.
// ============================================================
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET no configurado');

const WRITE_METHODS = new Set(['PUT', 'DELETE']);

/**
 * requireAuth — valida el JWT y adjunta req.user.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'TOKEN_AUSENTE' });

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, role: payload.role, username: payload.username };
    return next();
  } catch {
    return res.status(401).json({ error: 'TOKEN_INVALIDO' });
  }
}

/**
 * requireRole — restringe por rol.
 *   requireRole('GERENCIA')
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'NO_AUTENTICADO' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ROL_NO_AUTORIZADO' });
    }
    return next();
  };
}

/**
 * requireOtpForMutation — Poka-yoke de autorización.
 * CAJERO y PREPARADOR no pueden ejecutar PUT/DELETE sin un OTP
 * de GERENCIA en el header `x-management-otp`.
 *
 * GERENCIA pasa directo. El OTP se valida contra el otp_secret
 * de algún usuario GERENCIA activo (TOTP / RFC 6238).
 */
export async function requireOtpForMutation(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  if (!req.user) return res.status(401).json({ error: 'NO_AUTENTICADO' });

  // La gerencia opera sin token de excepción.
  if (req.user.role === 'GERENCIA') return next();

  const otp = req.headers['x-management-otp'];
  if (!otp) {
    await writeAudit({
      userId: req.user.id,
      action: 'OTP_MISSING',
      entity: req.baseUrl + req.path,
      severity: 'WARN',
      ip: req.ip,
      metadata: { method: req.method },
    });
    return res.status(403).json({ error: 'OTP_GERENCIA_REQUERIDO' });
  }

  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, otp_secret FROM users
          WHERE role = 'GERENCIA' AND is_active = 1 AND otp_secret IS NOT NULL`,
    args: [],
  });

  const valid = rows.some((u) =>
    authenticator.check(String(otp), u.otp_secret)
  );

  if (!valid) {
    await writeAudit({
      userId: req.user.id,
      action: 'OTP_REJECT',
      entity: req.baseUrl + req.path,
      severity: 'ALERT',
      ip: req.ip,
      metadata: { method: req.method },
    });
    return res.status(403).json({ error: 'OTP_INVALIDO' });
  }

  await writeAudit({
    userId: req.user.id,
    action: 'OTP_GRANTED',
    entity: req.baseUrl + req.path,
    severity: 'INFO',
    ip: req.ip,
    metadata: { method: req.method },
  });
  return next();
}
