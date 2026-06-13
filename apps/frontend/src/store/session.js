// ============================================================
// Store global de sesión (zustand). Centraliza usuario + permisos y el ciclo
// de vida de la sesión: restaurar (al recargar), login y logout.
// Conserva intacta la firma HMAC (setSessionKey) y el logout que revoca la
// clave de firma en el server. La navegación la hace App con el path retornado.
// ============================================================
import { create } from 'zustand';
import { api, setToken, clearToken, getToken } from '../lib/api.js';
import { setSessionKey } from '../lib/crypto.js';
import { ALL_ITEMS } from '../config/nav.js';

function clearLocalSession() {
  clearToken();
  localStorage.removeItem('user');
  localStorage.removeItem('session');
}

export const useSession = create((set) => ({
  user: null,
  perms: {},
  booting: true,
  sessionMsg: '',

  setSessionMsg: (sessionMsg) => set({ sessionMsg }),

  // Restaura la sesión al recargar (sin re-login) si el JWT sigue vigente.
  restore: async () => {
    try {
      const token = getToken();
      const su = JSON.parse(localStorage.getItem('user') || 'null');
      const ss = JSON.parse(localStorage.getItem('session') || 'null');
      if (token && su && ss) {
        const me = await api('/permissions/me'); // valida el JWT
        await setSessionKey(ss.id, ss.key);       // restaura clave HMAC
        set({ perms: me.permissions, user: su });
      }
    } catch {
      clearLocalSession();
    } finally {
      set({ booting: false });
    }
  },

  // Autentica, emite token + clave de firma y devuelve la ruta inicial.
  login: async (username, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(data.token);
    await setSessionKey(data.session.id, data.session.key);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('session', JSON.stringify(data.session));
    const me = await api('/permissions/me');
    set({ perms: me.permissions, user: data.user, sessionMsg: '' });
    const first = ALL_ITEMS.find((n) => me.permissions[n.perm]);
    return first ? `/${first.key}` : '/';
  },

  // Revoca la clave HMAC en el server (best-effort) y limpia el estado local.
  logout: (msg = '') => {
    try {
      const ss = JSON.parse(localStorage.getItem('session') || 'null');
      if (getToken() && ss?.id) api('/auth/logout', { method: 'POST', body: { sessionId: ss.id } }).catch(() => {});
    } catch { /* el cierre local procede igual */ }
    clearLocalSession();
    set({ user: null, perms: {}, sessionMsg: msg });
  },
}));
