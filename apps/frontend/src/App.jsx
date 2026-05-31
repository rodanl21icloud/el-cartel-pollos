import { useState, useEffect } from 'react';
import { api, setToken, clearToken, getToken } from './lib/api.js';
import { setSessionKey } from './lib/crypto.js';
import Login from './screens/Login.jsx';
import Pos from './screens/Pos.jsx';
import CashClose from './screens/CashClose.jsx';
import Merma from './screens/Merma.jsx';
import Manage from './screens/Manage.jsx';
import Gastos from './screens/Gastos.jsx';
import Flujo from './screens/Flujo.jsx';
import Pnl from './screens/Pnl.jsx';
import Permisos from './screens/Permisos.jsx';

// Cada ítem de nav se muestra solo si el usuario tiene el permiso `perm`.
const NAV = [
  { key: 'pos', label: 'POS', perm: 'pos.sell' },
  { key: 'gastos', label: 'Gastos', perm: 'expenses.manage' },
  { key: 'merma', label: 'Mermas', perm: 'inventory.merma' },
  { key: 'cash', label: 'Caja', perm: 'cash.operate' },
  { key: 'flujo', label: 'Flujo', perm: 'reports.view' },
  { key: 'pnl', label: 'P&L', perm: 'reports.view' },
  { key: 'manage', label: 'Gestión', perm: 'menu.manage' },
  { key: 'permisos', label: 'Permisos', perm: 'permissions.manage' },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState({});
  const [screen, setScreen] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  async function handleLogin(username, password) {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    setToken(data.token);
    await setSessionKey(data.session.id, data.session.key); // clave HMAC solo en memoria
    const me = await api('/permissions/me');
    setPerms(me.permissions);
    setUser(data.user);
    // Primera pantalla permitida.
    const first = NAV.find((n) => me.permissions[n.perm]);
    setScreen(first ? first.key : null);
  }

  function logout() { clearToken(); setUser(null); setPerms({}); setScreen(null); }

  if (!user || !getToken()) return <Login onLogin={handleLogin} />;

  const visibleNav = NAV.filter((n) => perms[n.perm]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-cartel text-white px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black">🐔 El Cartel</span>
          <span className={`text-xs px-2 py-1 rounded-full ${online ? 'bg-green-600' : 'bg-zinc-700'}`}>
            {online ? 'EN LÍNEA' : 'OFFLINE'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {visibleNav.map((n) => (
            <button key={n.key} onClick={() => setScreen(n.key)}
              className={`px-3 py-2 rounded-lg font-bold ${screen === n.key ? 'bg-white text-cartel' : 'bg-cartel-dark'}`}>
              {n.label}
            </button>
          ))}
          <span className="text-sm opacity-90 ml-2">{user.name} · {user.role}</span>
          <button onClick={logout} className="px-3 py-2 rounded-lg bg-cartel-dark font-bold">Salir</button>
        </div>
      </header>

      <main className="flex-1 p-4">
        {!screen && <p className="text-center text-zinc-500 mt-10">No tienes módulos habilitados. Contacta a gerencia.</p>}
        {screen === 'pos' && <Pos />}
        {screen === 'gastos' && <Gastos />}
        {screen === 'merma' && <Merma />}
        {screen === 'cash' && <CashClose />}
        {screen === 'flujo' && <Flujo role={user.role} />}
        {screen === 'pnl' && <Pnl role={user.role} />}
        {screen === 'manage' && <Manage role={user.role} />}
        {screen === 'permisos' && <Permisos />}
      </main>
    </div>
  );
}
