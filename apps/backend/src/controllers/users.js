// ============================================================
// Gestión de usuarios (solo permiso permissions.manage / gerencia).
// Crear, editar rol/estado, resetear contraseña. OTP para GERENCIA.
// ============================================================
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';
import { ROLE_KEYS } from '../config/roles.js';

const ROLES = ROLE_KEYS;
const OTP_ROLES = new Set(['GERENCIA', 'ADMIN']); // roles con secreto TOTP para mutaciones sensibles

/** GET /api/users */
export async function listUsers(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, username, full_name, role, is_active, (otp_secret IS NOT NULL) AS has_otp, created_at
          FROM users ORDER BY (role='GERENCIA') DESC, full_name`,
    args: [],
  });
  return res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active, has_otp: !!r.has_otp })));
}

/** POST /api/users  Body: { username, full_name, role, password } */
export async function createUser(req, res) {
  const { username, full_name, role, password } = req.body || {};
  if (!username || !/^[a-z0-9_.]{3,}$/i.test(String(username).trim())) return res.status(400).json({ error: 'USUARIO_INVALIDO' });
  if (!full_name || !String(full_name).trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'ROL_INVALIDO' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'CLAVE_CORTA' });

  const db = getDb();
  const hash = await bcrypt.hash(String(password), 10);
  const otp = OTP_ROLES.has(role) ? authenticator.generateSecret() : null;
  const id = randomUUID();
  try {
    await db.execute({
      sql: `INSERT INTO users (id, username, password_hash, full_name, role, otp_secret) VALUES (?,?,?,?,?,?)`,
      args: [id, String(username).trim().toLowerCase(), hash, String(full_name).trim(), role, otp],
    });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'USUARIO_DUPLICADO' });
    if (/CHECK|constraint/i.test(String(e.message))) return res.status(409).json({ error: 'ROL_NO_DISPONIBLE', detail: 'Ejecuta la migración de roles (migrate-roles.mjs).' });
    throw e;
  }
  await writeAudit({ userId: req.user.id, action: 'USER_CREATE', entity: 'users', entityId: id, severity: 'INFO', ip: req.ip, metadata: { username, role } });
  // El secreto OTP se devuelve UNA vez (para cargar en la app autenticadora).
  return res.status(201).json({ id, username, full_name, role, is_active: true, otp_secret: otp });
}

/** PUT /api/users/:id  Body: { full_name?, role?, is_active? } */
export async function updateUser(req, res) {
  const { id } = req.params;
  const { full_name, role, is_active } = req.body || {};
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'ROL_INVALIDO' });

  const db = getDb();
  const cur = (await db.execute({ sql: `SELECT * FROM users WHERE id = ?`, args: [id] })).rows[0];
  if (!cur) return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });

  // Anti-lockout: no dejar el sistema sin un administrador (gerencia/admin) activo.
  const wasAdmin = OTP_ROLES.has(cur.role);
  const becomesNonAdmin = role && !OTP_ROLES.has(role);
  const quita = wasAdmin && (becomesNonAdmin || is_active === false);
  if (quita) {
    const otros = (await db.execute({
      sql: `SELECT COUNT(*) n FROM users WHERE role IN ('GERENCIA','ADMIN') AND is_active=1 AND id <> ?`, args: [id],
    })).rows[0].n;
    if (Number(otros) === 0) return res.status(409).json({ error: 'ULTIMA_GERENCIA' });
  }

  const next = {
    full_name: full_name != null ? String(full_name).trim() : cur.full_name,
    role: role || cur.role,
    is_active: is_active != null ? (is_active ? 1 : 0) : cur.is_active,
  };
  // Si pasa a un rol administrador y no tiene OTP, generarlo.
  let newOtp = null;
  let otpSql = '', otpArgs = [];
  if (OTP_ROLES.has(next.role) && !cur.otp_secret) { newOtp = authenticator.generateSecret(); otpSql = ', otp_secret = ?'; otpArgs = [newOtp]; }

  await db.execute({
    sql: `UPDATE users SET full_name=?, role=?, is_active=?${otpSql}, updated_at=datetime('now') WHERE id=?`,
    args: [next.full_name, next.role, next.is_active, ...otpArgs, id],
  });
  await writeAudit({ userId: req.user.id, action: 'USER_UPDATE', entity: 'users', entityId: id, severity: 'INFO', ip: req.ip, metadata: next });
  return res.json({ id, ...next, is_active: !!next.is_active, otp_secret: newOtp });
}

/** POST /api/users/:id/password  Body: { password } */
export async function resetPassword(req, res) {
  const { password } = req.body || {};
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'CLAVE_CORTA' });
  const db = getDb();
  const cur = (await db.execute({ sql: `SELECT id FROM users WHERE id = ?`, args: [req.params.id] })).rows[0];
  if (!cur) return res.status(404).json({ error: 'USUARIO_NO_ENCONTRADO' });
  const hash = await bcrypt.hash(String(password), 10);
  await db.execute({ sql: `UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?`, args: [hash, req.params.id] });
  await writeAudit({ userId: req.user.id, action: 'USER_PASSWORD_RESET', entity: 'users', entityId: req.params.id, severity: 'WARN', ip: req.ip });
  return res.json({ id: req.params.id, ok: true });
}
