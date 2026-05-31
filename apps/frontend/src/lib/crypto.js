// ============================================================
// Firma HMAC-SHA256 de payloads de venta (Web Crypto API).
// La clave de sesión se recibe en login y vive solo en memoria.
// La canonicalización DEBE coincidir con el backend (hmac.js).
// ============================================================

let _sessionKey = null;   // hex string (256-bit)
let _sessionId = null;
let _cryptoKey = null;    // CryptoKey importada

/** Guarda la clave de sesión entregada por el backend en login. */
export async function setSessionKey(sessionId, hexKey) {
  _sessionId = sessionId;
  _sessionKey = hexKey;
  const raw = hexToBytes(hexKey);
  _cryptoKey = await crypto.subtle.importKey(
    'raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
}

export function getSessionId() {
  return _sessionId;
}

/** Serialización canónica determinista (idéntica al backend). */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Firma un payload y devuelve el sobre listo para enviar al backend. */
export async function signSale(payload) {
  if (!_cryptoKey) throw new Error('SESION_SIN_CLAVE');
  const data = new TextEncoder().encode(canonicalize(payload));
  const sig = await crypto.subtle.sign('HMAC', _cryptoKey, data);
  return { payload, sessionId: _sessionId, hash: bytesToHex(new Uint8Array(sig)) };
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}
