import { useState, useEffect, useRef } from 'react';
import { api, setToken, clearToken, getToken } from './lib/api.js';
import { setSessionKey } from './lib/crypto.js';
import { NAV, ALL_ITEMS, itemByKey } from './config/nav.js';
import { roleLabel } from './config/roles.js';
import { Forbidden } from './components/ui/States.jsx';
import Login from './screens/Login.jsx';
import Pos from './screens/Pos.jsx';
import CashClose from './screens/CashClose.jsx';
import Merma from './screens/Merma.jsx';
import Gastos from './screens/Gastos.jsx';
import Flujo from './screens/Flujo.jsx';
import Pnl from './screens/Pnl.jsx';
import Estadisticas from './screens/Estadisticas.jsx';
import Movimientos from './screens/Movimientos.jsx';
import Prediccion from './screens/Prediccion.jsx';
import Resumen from './screens/Resumen.jsx';
import Banco from './screens/Banco.jsx';
import Ventas from './screens/Ventas.jsx';
import VentaRetroactiva from './screens/VentaRetroactiva.jsx';
import Permisos from './screens/Permisos.jsx';
import Inventario from './screens/Inventario.jsx';
import Carta from './screens/Carta.jsx';
import Modificadores from './screens/Modificadores.jsx';
import Despacho from './screens/Despacho.jsx';
import Ajustes from './screens/Ajustes.jsx';
import Clientes from './screens/Clientes.jsx';
import Usuarios from './screens/Usuarios.jsx';
import Auditoria from './screens/Auditoria.jsx';

// Inactividad: cierra sesión tras 30 min sin actividad (operación de caja).
const IDLE_MS = 30 * 60 * 1000;

export default function App() {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState({});
  const [screen, setScreen] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [drawer, setDrawer] = useState(false);
  const [booting, setBooting] = useState(true);
  const [sessionMsg, setSessionMsg] = useState('');
  const idleTimer = useRef(null);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Restaurar la sesión al recargar (sin re-login) si el JWT sigue vigente.
  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        const su = JSON.parse(localStorage.getItem('user') || 'null');
        const ss = JSON.parse(localStorage.getItem('session') || 'null');
        if (token && su && ss) {
          const me = await api('/permissions/me'); // valida el JWT
          await setSessionKey(ss.id, ss.key);       // restaura clave HMAC
          setPerms(me.permissions); setUser(su);
          const first = ALL_ITEMS.find((n) => me.permissions[n.perm]);
          setScreen(first ? first.key : null);
        }
      } catch { clearToken(); localStorage.removeItem('user'); localStorage.removeItem('session'); }
      finally { setBooting(false); }
    })();
  }, []);

  async function handleLogin(username, password) {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(data.token);
    await setSessionKey(data.session.id, data.session.key);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('session', JSON.stringify(data.session));
    const me = await api('/permissions/me');
    setPerms(me.permissions);
    setUser(data.user);
    const first = ALL_ITEMS.find((n) => me.permissions[n.perm]);
    setScreen(first ? first.key : null);
  }
  function logout(msg = '') {
    clearToken(); localStorage.removeItem('user'); localStorage.removeItem('session');
    setUser(null); setPerms({}); setScreen(null); setSessionMsg(msg);
  }
  function go(key) { setScreen(key); setDrawer(false); }

  // Seguridad de sesión: cierre por 401 global y por inactividad.
  useEffect(() => {
    const onExpired = () => { if (getToken()) logout('Tu sesión expiró. Inicia sesión de nuevo.'); };
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);
  useEffect(() => {
    if (!user) return;
    const reset = () => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => logout('Sesión cerrada por inactividad.'), IDLE_MS);
    };
    const evs = ['mousedown', 'keydown', 'touchstart', 'visibilitychange'];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { evs.forEach((e) => window.removeEventListener(e, reset)); clearTimeout(idleTimer.current); };
  }, [user]);

  if (booting) return <div className="h-screen grid place-items-center bg-ink"><img src="/logo.jpeg" alt="" className="w-48 rounded-xl animate-pulse" /></div>;
  if (!user || !getToken()) return <Login onLogin={handleLogin} notice={sessionMsg} />;

  const current = itemByKey(screen);
  const currentSection = NAV.find((g) => g.items.some((i) => i.key === screen))?.section;
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => perms[i.perm]) })).filter((g) => g.items.length);

  return (
    <div className="h-screen flex bg-slate-100 overflow-hidden">
      {/* Sidebar — desktop / tablet */}
      <aside className="hidden md:flex flex-col w-60 lg:w-64 shrink-0 bg-ink text-white">
        <Brand />
        <NavList groups={groups} screen={screen} onGo={go} />
        <UserFooter user={user} online={online} onLogout={logout} />
      </aside>

      {/* Drawer — móvil */}
      {drawer && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-ink text-white flex flex-col animate-[slidein_.2s_ease]">
            <Brand onClose={() => setDrawer(false)} />
            <NavList groups={groups} screen={screen} onGo={go} />
            <UserFooter user={user} online={online} onLogout={logout} />
          </aside>
        </div>
      )}

      {/* Contenido */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => setDrawer(true)} className="md:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100" aria-label="Menú">
            <Bars />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{current?.icon}</span>
            <div className="min-w-0">
              {currentSection && <div className="text-[10px] font-bold uppercase tracking-wider text-ink-mute leading-none">{currentSection}</div>}
              <h1 className="text-lg font-extrabold tracking-tight truncate leading-tight">{current?.label || 'Inicio'}</h1>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {online ? 'En línea' : 'Offline'}
            </span>
            <div className="hidden sm:flex items-center gap-2">
              <Avatar name={user.name} />
              <div className="leading-tight">
                <div className="text-sm font-bold">{user.name}</div>
                <div className="text-[11px] text-ink-mute">{roleLabel(user.role)}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {!screen && <p className="text-center text-ink-mute mt-12">No tienes módulos habilitados. Contacta a un administrador.</p>}
          {/* Guard de permiso por pantalla (defensa además del filtro de menú). */}
          {current && !perms[current.perm] ? <Forbidden module={current.label.toLowerCase()} /> : <>
          {screen === 'pos' && <Pos onNavigate={go} />}
          {screen === 'ventas' && <Ventas canVoid={!!perms['sales.void']} />}
          {screen === 'retroactiva' && <VentaRetroactiva user={user} />}
          {screen === 'despacho' && <Despacho />}
          {screen === 'prediccion' && <Prediccion />}
          {screen === 'clientes' && <Clientes />}
          {screen === 'gastos' && <Gastos />}
          {screen === 'merma' && <Merma />}
          {screen === 'inventario' && <Inventario />}
          {screen === 'cash' && <CashClose userName={user.name} />}
          {screen === 'resumen' && <Resumen role={user.role} />}
          {screen === 'movimientos' && <Movimientos />}
          {screen === 'estadisticas' && <Estadisticas />}
          {screen === 'banco' && <Banco role={user.role} />}
          {screen === 'flujo' && <Flujo role={user.role} />}
          {screen === 'pnl' && <Pnl role={user.role} />}
          {screen === 'carta' && <Carta role={user.role} />}
          {screen === 'modificadores' && <Modificadores role={user.role} />}
          {screen === 'ajustes' && <Ajustes role={user.role} />}
          {screen === 'usuarios' && <Usuarios />}
          {screen === 'permisos' && <Permisos />}
          {screen === 'auditoria' && <Auditoria />}
          </>}
        </main>
      </div>
    </div>
  );
}

function Brand({ onClose }) {
  return (
    <div className="h-16 flex items-center gap-2 px-4 border-b border-white/10 shrink-0">
      <img src="/logo.jpeg" alt="El Cartel de los Pollos" className="h-10 rounded-md bg-white px-1.5 py-0.5" />
      {onClose && <button onClick={onClose} className="ml-auto p-2 rounded-lg hover:bg-white/10 text-slate-300">✕</button>}
    </div>
  );
}

function NavList({ groups, screen, onGo }) {
  return (
    <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
      {groups.map((g) => (
        <div key={g.section} className={g.kind === 'ADMIN' ? 'pt-4 mt-2 border-t border-white/10' : ''}>
          <div className="px-3 mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            {g.kind === 'ADMIN' && <span className="text-amber-400">🔒</span>}{g.section}
          </div>
          <div className="space-y-0.5">
            {g.items.map((i) => (
              <button key={i.key} onClick={() => onGo(i.key)}
                className={`nav-item w-full text-left ${screen === i.key ? 'nav-item-active' : ''}`}>
                <span className="text-lg w-5 text-center">{i.icon}</span>
                <span className="text-sm">{i.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UserFooter({ user, online, onLogout }) {
  return (
    <div className="border-t border-white/10 p-3 shrink-0">
      <div className="flex items-center gap-2 px-2 py-1">
        <Avatar name={user.name} dark />
        <div className="leading-tight min-w-0 flex-1">
          <div className="text-sm font-bold truncate">{user.name}</div>
          <div className="text-[11px] text-slate-400">{user.role}</div>
        </div>
        <button onClick={onLogout} title="Cerrar sesión" className="p-2 rounded-lg hover:bg-white/10 text-slate-300">⏻</button>
      </div>
    </div>
  );
}

function Avatar({ name, dark }) {
  const initials = (name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`w-9 h-9 rounded-full grid place-items-center font-black text-sm shrink-0 ${dark ? 'bg-white/10 text-white' : 'bg-cartel text-white'}`}>
      {initials}
    </div>
  );
}

function Bars() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
