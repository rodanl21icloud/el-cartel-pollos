// Cliente HTTP minimal con JWT + soporte de header OTP de gerencia.
const TOKEN_KEY = 'jwt';

export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

export async function api(path, { method = 'GET', body, otp } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (otp) headers['x-management-otp'] = otp; // requerido para PUT/DELETE de cajero/preparador

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

// Descarga autenticada (CSV/binario): añade el JWT y dispara el guardado del archivo.
export async function apiDownload(path, filename) {
  const token = getToken();
  const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('No se pudo generar el reporte');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
