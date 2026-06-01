import { useState, useEffect } from 'react';
import { api, setToken, clearToken, getToken } from './lib/api.js';
import { setSessionKey } from './lib/crypto.js';
import Login from './screens/Login.jsx';
import Pos from './screens/Pos.jsx';
import CashClose from './screens/CashClose.jsx';
import Merma from './screens/Merma.jsx';
import Gastos from './screens/Gastos.jsx';
import Flujo from './screens/Flujo.jsx';
import Pnl from './screens/Pnl.jsx';
import Estadisticas from './screens/Estadisticas.jsx';
import Banco from './screens/Banco.jsx';
import Ventas from './screens/Ventas.jsx';
import Permisos from './screens/Permisos.jsx';
import Inventario from './screens/Inventario.jsx';
import Carta from './screens/Carta.jsx';
import Modificadores from './screens/Modificadores.jsx';
import Despacho from './screens/Despacho.jsx';
import Ajustes from './screens/Ajustes.jsx';
import Clientes from './screens/Clientes.jsx';
import Usuarios from './screens/Usuarios.jsx';

// Navegación agrupada por sección. Cada ítem se muestra según el permiso.
const NAV = [
  { section: 'Operación', items: [
    { key: 'pos', label: 'Vender', icon: '🛒', perm: 'pos.sell' },
    { key: 'ventas', label: 'Ventas', icon: '🧾', perm: 'pos.sell' },
    { key: 'despacho', label: 'Despacho', icon: '🛵', perm: 'dispatch.manage' },
    { key: 'cash', label: 'Caja', icon: '💵', perm: 'cash.operate' },
    { key: 'merma', label: 'Mermas', icon: '🗑️', perm: 'inventory.merma' },
  ] },
  { section: 'Catálogo', items: [
    { key: 'carta', label: 'Carta', icon: '🍗', perm: 'menu.manage' },
    { key: 'modificadores', label: 'Modificadores', icon: '✨', perm: 'menu.manage' },
    { key: 'inventario', label: 'Inventario', icon: '📦', perm: 'inventory.manage' },
  ] },
  { section: 'Finanzas', items: [
    { key: 'estadisticas', label: 'Estadísticas', icon: '📊', perm: 'reports.view' },
    { key: 'gastos', label: 'Gastos', icon: '💸', perm: 'expenses.manage' },
    { key: 'flujo', label: 'Flujo de caja', icon: '📈', perm: 'reports.view' },
    { key: 'banco', label: 'Banco', icon: '🏦', perm: 'reports.view' },
    { key: 'pnl', label: 'P&L', icon: '🧮', perm: 'reports.view' },
  ] },
  { section: 'Contactos', items: [
    { key: 'clientes', label: 'Clientes', icon: '👥', perm: 'pos.sell' },
  ] },
  { section: 'Configuración', items: [
    { key: 'ajustes', label: 'Negocio', icon: '⚙️', perm: 'settings.manage' },
    { key: 'usuarios', label: 'Usuarios', icon: '👤', perm: 'permissions.manage' },
    { key: 'permisos', label: 'Permisos', icon: '🔐', perm: 'permissions.manage' },
  ] },
];
const ALL_ITEMS = NAV.flatMap((g) => g.items);

export default function App() {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState({});
  const [screen, setScreen] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  async function handleLogin(username, password) {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(data.token);
    await setSessionKey(data.session.id, data.session.key);
    const me = await api('/permissions/me');
    setPerms(me.permissions);
    setUser(data.user);
    const first = ALL_ITEMS.find((n) => me.permissions[n.perm]);
    setScreen(first ? first.key : null);
  }
  function logout() { clearToken(); setUser(null); setPerms({}); setScreen(null); }
  function go(key) { setScreen(key); setDrawer(false); }

  if (!user || !getToken()) return <Login onLogin={handleLogin} />;

  const current = ALL_ITEMS.find((n) => n.key === screen);
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
            <h1 className="text-lg font-extrabold tracking-tight truncate">{current?.label || 'Inicio'}</h1>
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
                <div className="text-[11px] text-ink-mute">{user.role}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {!screen && <p className="text-center text-ink-mute mt-12">No tienes módulos habilitados. Contacta a gerencia.</p>}
          {screen === 'pos' && <Pos onNavigate={go} />}
          {screen === 'ventas' && <Ventas canVoid={!!perms['reports.view']} />}
          {screen === 'despacho' && <Despacho />}
          {screen === 'clientes' && <Clientes />}
          {screen === 'gastos' && <Gastos />}
          {screen === 'merma' && <Merma />}
          {screen === 'inventario' && <Inventario />}
          {screen === 'cash' && <CashClose userName={user.name} />}
          {screen === 'estadisticas' && <Estadisticas role={user.role} />}
          {screen === 'banco' && <Banco role={user.role} />}
          {screen === 'flujo' && <Flujo role={user.role} />}
          {screen === 'pnl' && <Pnl role={user.role} />}
          {screen === 'carta' && <Carta role={user.role} />}
          {screen === 'modificadores' && <Modificadores role={user.role} />}
          {screen === 'ajustes' && <Ajustes role={user.role} />}
          {screen === 'usuarios' && <Usuarios />}
          {screen === 'permisos' && <Permisos />}
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
        <div key={g.section}>
          <div className="px-3 mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{g.section}</div>
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
