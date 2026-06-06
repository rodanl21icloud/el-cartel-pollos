// ============================================================
// Controlador de autenticación.
// Login -> verifica credenciales, emite JWT y entrega (una sola vez)
// la clave de sesión temporal usada para firmar ventas con HMAC.
// ============================================================
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../db.js';
import { issueSessionKey } from '../services/sessionKeys.js';
import { writeAudit } from '../services/audit.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_TTL = process.env.JWT_TTL || '12h';

export async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'CREDENCIALES_INCOMPLETAS' });
    }

    const db = getDb();
    const { rows } = await db.execute({
      sql: `SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = ?`,
      args: [username],
    });

    const user = rows[0];
    const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash));

    if (!ok) {
      await writeAudit({
        userId: user?.id ?? null,
        action: 'LOGIN_FAIL',
        entity: 'users',
        entityId: user?.id ?? null,
        severity: 'WARN',
        ip: req.ip,
        metadata: { username },
      });
      return res.status(401).json({ error: 'CREDENCIALES_INVALIDAS' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: JWT_TTL }
    );

    const { sessionId, key } = await issueSessionKey(user.id);

    await writeAudit({
      userId: user.id,
      action: 'LOGIN_OK',
      entity: 'users',
      entityId: user.id,
      severity: 'INFO',
      ip: req.ip,
    });

    return res.json({
      token,
      user: { id: user.id, name: user.full_name, role: user.role },
      session: { id: sessionId, key },
    });
  } catch (err) {
    console.error('[LOGIN ERROR]', err.message, err.stack);
    return res.status(500).json({ error: 'ERROR_INTERNO_LOGIN', detail: err.message });
  }
}
