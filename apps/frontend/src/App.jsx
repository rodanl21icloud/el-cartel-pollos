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

export default function App() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState('pos');
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
    setUser(data.user);
  }

  function logout() { clearToken(); setUser(null); }

  if (!user || !getToken()) return <Login onLogin={handleLogin} />;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-cartel text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black">🐔 El Cartel</span>
          <span className={`text-xs px-2 py-1 rounded-full ${online ? 'bg-green-600' : 'bg-zinc-700'}`}>
            {online ? 'EN LÍNEA' : 'OFFLINE'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {[
            ['pos', 'POS'],
            ['gastos', 'Gastos'],
            ['merma', 'Mermas'],
            ['cash', 'Caja'],
            ['flujo', 'Flujo'],
            ['manage', 'Gestión'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setScreen(key)}
              className={`px-3 py-2 rounded-lg font-bold ${screen === key ? 'bg-white text-cartel' : 'bg-cartel-dark'}`}>
              {label}
            </button>
          ))}
          <span className="text-sm opacity-90 ml-2">{user.name} · {user.role}</span>
          <button onClick={logout} className="px-3 py-2 rounded-lg bg-cartel-dark font-bold">Salir</button>
        </div>
      </header>

      <main className="flex-1 p-4">
        {screen === 'pos' && <Pos />}
        {screen === 'gastos' && <Gastos />}
        {screen === 'merma' && <Merma />}
        {screen === 'cash' && <CashClose />}
        {screen === 'flujo' && <Flujo role={user.role} />}
        {screen === 'manage' && <Manage role={user.role} />}
      </main>
    </div>
  );
}
