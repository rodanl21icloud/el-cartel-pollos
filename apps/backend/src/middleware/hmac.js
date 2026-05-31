// ============================================================
// Middleware Anti-Tamper: validación HMAC-SHA256 de payloads.
// Toda venta sincronizada (especialmente offline) llega firmada
// con una clave de sesión temporal. Si el hash no coincide, se
// rechaza la carga -> el operador no puede manipular datos locales.
// ============================================================
import crypto from 'node:crypto';
import { getSessionKey } from '../services/sessionKeys.js';
import { writeAudit } from '../services/audit.js';

/**
 * Serialización canónica determinista: ordena claves recursivamente
 * para que frontend y backend produzcan EXACTAMENTE el mismo string.
 */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Comparación en tiempo constante para evitar timing attacks.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * verifyHmac — espera:
 *   body: { payload: {...}, sessionId: '...', hash: '<hex>' }
 * Recalcula HMAC-SHA256(canonicalize(payload), sessionKey) y compara.
 */
export async function verifyHmac(req, res, next) {
  const { payload, sessionId, hash } = req.body || {};

  if (!payload || !sessionId || !hash) {
    return res.status(400).json({ error: 'FIRMA_INCOMPLETA' });
  }

  const sessionKey = await getSessionKey(sessionId, req.user?.id);
  if (!sessionKey) {
    return res.status(401).json({ error: 'SESION_NO_VALIDA' });
  }

  // La clave de sesión viaja como hex; se usa como 32 bytes crudos
  // (debe coincidir con la importación raw del frontend en crypto.js).
  const expected = crypto
    .createHmac('sha256', Buffer.from(sessionKey, 'hex'))
    .update(canonicalize(payload))
    .digest('hex');

  if (!safeEqual(expected, String(hash))) {
    await writeAudit({
      userId: req.user?.id ?? null,
      action: 'HMAC_REJECT',
      entity: 'sales',
      entityId: payload.client_uuid ?? null,
      severity: 'ALERT',
      ip: req.ip,
      metadata: { sessionId },
    });
    return res.status(409).json({ error: 'PAYLOAD_MANIPULADO' });
  }

  // Firma válida: el controlador trabaja sobre el payload verificado.
  req.verifiedPayload = payload;
  return next();
}
