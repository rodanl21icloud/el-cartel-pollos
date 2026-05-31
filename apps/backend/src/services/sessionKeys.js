// Gestión de claves de sesión temporales para firma HMAC de ventas.
// En login se genera una clave aleatoria, se entrega al frontend UNA
// vez y se guarda server-side asociada al usuario con expiración corta.
//
// MVP: store en memoria. Producción: Redis / tabla con TTL.
import crypto from 'node:crypto';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h por turno
const store = new Map(); // sessionId -> { key, userId, expiresAt }

export function issueSessionKey(userId) {
  const sessionId = crypto.randomUUID();
  const key = crypto.randomBytes(32).toString('hex'); // 256-bit
  store.set(sessionId, { key, userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return { sessionId, key }; // `key` se envía al cliente solo aquí.
}

export async function getSessionKey(sessionId, userId) {
  const entry = store.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(sessionId);
    return null;
  }
  if (userId && entry.userId !== userId) return null;
  return entry.key;
}

export function revokeSessionKey(sessionId) {
  store.delete(sessionId);
}
