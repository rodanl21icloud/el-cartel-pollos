// Cliente HTTP minimal con JWT + soporte de header OTP de gerencia.
const BASE = import.meta.env.VITE_API_URL ?? '';
const TOKEN_KEY = 'jwt';

export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

export async function api(path, { method = 'GET', body, otp } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (otp) headers['x-management-otp'] = otp; // requerido para PUT/DELETE de cajero/preparador

  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // Error de red (servidor caído, sin conexión, CORS bloqueado, etc.)
    throw Object.assign(new Error(`Sin conexión: ${networkErr.message}`), { status: 0 });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && ['TOKEN_AUSENTE', 'TOKEN_INVALIDO', 'NO_AUTENTICADO'].includes(data.error)) {
      window.dispatchEvent(new CustomEvent('session-expired', { detail: { reason: 'expired' } }));
    }
    const msg = data.error || data.message || data.detail || `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, data });
  }
  return data;
}
