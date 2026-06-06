// Gestión de claves de sesión para firma HMAC de ventas.
// En login se genera una clave aleatoria, se entrega al frontend UNA vez y se
// guarda server-side (tabla session_keys) con expiración. Persistente: sobrevive
// a reinicios/redeploys (antes era un Map en memoria que se perdía al reiniciar).
import crypto from 'node:crypto';
import { getDb } from '../db.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h por turno

export async function issueSessionKey(userId) {
  const sessionId = crypto.randomUUID();
  const key = crypto.randomBytes(32).toString('hex'); // 256-bit
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await getDb().execute({ sql: `INSERT INTO session_keys (id, key, user_id, expires_at) VALUES (?,?,?,?)`, args: [sessionId, key, userId, expiresAt] });
  return { sessionId, key }; // `key` se envía al cliente solo aquí.
}

export async function getSessionKey(sessionId, userId) {
  const r = (await getDb().execute({ sql: `SELECT key, user_id, expires_at FROM session_keys WHERE id = ?`, args: [sessionId] })).rows[0];
  if (!r) return null;
  if (new Date(r.expires_at).getTime() < Date.now()) { await getDb().execute({ sql: `DELETE FROM session_keys WHERE id = ?`, args: [sessionId] }); return null; }
  if (userId && r.user_id !== userId) return null;
  return r.key;
}

export async function revokeSessionKey(sessionId) {
  await getDb().execute({ sql: `DELETE FROM session_keys WHERE id = ?`, args: [sessionId] });
}
