import { useState, useEffect, useRef } from 'react';
import { api, setToken, clearToken, getToken } from './lib/api.js';
import { setSessionKey } from './lib/crypto.js';
import { NAV, ALL_ITEMS, itemByKey } from './config/nav.js';
import { Icon } from './config/icons.jsx';
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
import Cuadre from './screens/Cuadre.jsx';
import Finanzas from './screens/Finanzas.jsx';
import Home from './screens/Home.jsx';
import CentroOperaciones from './screens/CentroOperaciones.jsx';
import Comercial from './screens/Comercial.jsx';
import Banco from './screens/Banco.jsx';
import Ventas from './screens/Ventas.jsx';
import VentaRetroactiva from './screens/VentaRetroactiva.jsx';
import Permisos from './screens/Permisos.jsx';
import Inventario from './screens/Inventario.jsx';
import PreciosInsumos from './screens/PreciosInsumos.jsx';
import Carta from './screens/Carta.jsx';
import Cartelera from './screens/Cartelera.jsx';
import Modificadores from './screens/Modificadores.jsx';
import Despacho from './screens/Despacho.jsx';
import Kds from './screens/Kds.jsx';
import Ajustes from './screens/Ajustes.jsx';
import Clientes from './screens/Clientes.jsx';
import Usuarios from './screens/Usuarios.jsx';
import Auditoria from './screens/Auditoria.jsx';

// Inactividad: cierra sesión tras 30 min sin actividad (operación de caja).
const IDLE_MS = 8 * 60 * 60 * 1000; // 8 horas (un turno completo)

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
          setScreen('home');
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

  if (booting) return (
    <div className="h-screen grid place-items-center bg-ink">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo.jpeg" alt="" className="w-40 rounded-xl animate-pulse" />
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-cartel animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
  if (!user || !getToken()) return <Login onLogin={handleLogin} notice={sessionMsg} />;

  const current = itemByKey(screen);
  const currentSection = NAV.find((g) => g.items.some((i) => i.key === screen))?.section;
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => perms[i.perm]) })).filter((g) => g.items.length);

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: '#f3efe7' }}>
      {/* Sidebar — desktop / tablet */}
      <aside className="hidden md:flex flex-col w-[220px] lg:w-[240px] shrink-0 text-white relative" style={{ background: '#16110c' }}>
        {/* Accent line derecha */}
        <div className="absolute top-0 right-0 bottom-0 w-px bg-ink-border" />
        {/* Glow de brasas en la base */}
        <div
          className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 100% 60% at 50% 112%, rgba(255,90,31,0.16) 0%, transparent 70%)' }}
        />
        <Brand />
        <NavList groups={groups} screen={screen} onGo={go} />
        <UserFooter user={user} online={online} onLogout={logout} />
      </aside>

      {/* Drawer — móvil */}
      {drawer && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <aside
            className="absolute left-0 top-0 bottom-0 w-72 text-white flex flex-col animate-[slidein_.2s_ease]"
            style={{ background: '#16110c' }}
          >
            <Brand onClose={() => setDrawer(false)} />
            <NavList groups={groups} screen={screen} onGo={go} />
            <UserFooter user={user} online={online} onLogout={logout} />
          </aside>
        </div>
      )}

      {/* Contenido */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="sticky top-0 z-20 px-4 sm:px-6 h-14 flex items-center gap-3 border-b"
          style={{
            background: 'rgba(250,247,241,0.9)',
            backdropFilter: 'blur(12px)',
            borderColor: '#e7e0d4',
          }}
        >
          <button
            onClick={() => setDrawer(true)}
            className="md:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Menú"
          >
            <Bars />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-cartel shrink-0">
              <Icon name={screen === 'home' ? 'home' : current?.icon} size={18} />
            </span>
            <div className="min-w-0">
              {currentSection && (
                <div className="text-[10px] font-condensed font-bold uppercase tracking-[0.15em] text-ink-mute leading-none">
                  {currentSection}
                </div>
              )}
              <h1 className="text-base font-bold tracking-tight truncate leading-tight text-slate-900">
                {current?.label || 'Inicio'}
              </h1>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-condensed font-bold px-2.5 py-1 rounded-full tracking-wide
                ${online ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {online ? 'En línea' : 'Offline'}
            </span>
            <div className="hidden sm:flex items-center gap-2">
              <Avatar name={user.name} />
              <div className="leading-tight">
                <div className="text-sm font-semibold text-slate-800">{user.name}</div>
                <div className="text-[10px] font-condensed text-ink-mute tracking-wide">{roleLabel(user.role)}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {!screen && <p className="text-center text-ink-mute mt-12">No tienes módulos habilitados. Contacta a un administrador.</p>}
          {/* Guard de permiso por pantalla (defensa además del filtro de menú). */}
          {current && !perms[current.perm] ? <Forbidden module={current.label.toLowerCase()} /> : <>
          {screen === 'home' && <Home role={user.role} onGo={go} userName={user.name} />}
          {screen === 'operaciones' && <CentroOperaciones />}
          {screen === 'pos' && <Pos onNavigate={go} />}
          {screen === 'ventas' && <Ventas canVoid={!!perms['sales.void']} />}
          {screen === 'retroactiva' && <VentaRetroactiva user={user} />}
          {screen === 'despacho' && <Despacho />}
          {screen === 'kds' && <Kds />}
          {screen === 'prediccion' && <Prediccion />}
          {screen === 'clientes' && <Clientes />}
          {screen === 'gastos' && <Gastos />}
          {screen === 'merma' && <Merma />}
          {screen === 'inventario' && <Inventario />}
          {screen === 'precios' && <PreciosInsumos />}
          {screen === 'cash' && <CashClose userName={user.name} />}
          {screen === 'finanzas' && <Finanzas role={user.role} />}
          {screen === 'comercial' && <Comercial />}
          {screen === 'resumen' && <Resumen role={user.role} />}
          {screen === 'cuadre' && <Cuadre />}
          {screen === 'movimientos' && <Movimientos onGo={go} canVoid={!!perms['sales.void']} />}
          {screen === 'estadisticas' && <Estadisticas />}
          {screen === 'banco' && <Banco role={user.role} />}
          {screen === 'flujo' && <Flujo role={user.role} />}
          {screen === 'pnl' && <Pnl role={user.role} />}
          {screen === 'carta' && <Carta role={user.role} />}
          {screen === 'cartelera' && <Cartelera />}
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
    <div className="h-14 flex items-center gap-2.5 px-4 border-b border-ink-border shrink-0">
      <img src="/logo.jpeg" alt="El Cartel de los Pollos" className="h-8 rounded-md" />
      <div className="min-w-0 flex-1">
        <div className="font-display text-white text-sm leading-none tracking-wide truncate">EL CARTEL</div>
        <div className="text-[9px] font-condensed text-ink-mute tracking-[0.2em] uppercase leading-none mt-0.5">de los Pollos</div>
      </div>
      {onClose && (
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-ink-mute shrink-0">✕</button>
      )}
    </div>
  );
}

function NavList({ groups, screen, onGo }) {
  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4">
      {/* Inicio */}
      <NavButton
        icon="home"
        label="Inicio"
        active={screen === 'home'}
        onClick={() => onGo('home')}
      />

      {groups.map((g) => (
        <div key={g.section} className={g.kind === 'ADMIN' ? 'pt-3 mt-1 border-t border-ink-border' : ''}>
          <div className="px-2 mb-1.5 flex items-center gap-1.5">
            {g.kind === 'ADMIN' && (
              <Icon name="lock" size={10} className="text-amber-500 shrink-0" />
            )}
            <span className="text-[10px] font-condensed font-bold uppercase tracking-[0.2em] text-ink-mute">
              {g.section}
            </span>
          </div>
          <div className="space-y-0.5">
            {g.items.map((i) => (
              <NavButton
                key={i.key}
                icon={i.icon}
                label={i.label}
                active={screen === i.key}
                onClick={() => onGo(i.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NavButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-150 group"
      style={active
        ? { background: 'rgba(255,90,31,0.14)', color: '#fff' }
        : { color: '#8a7c6b' }
      }
    >
      {/* Brasa lateral cuando activo (sello tipo hierro de marcar) */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{ background: 'linear-gradient(#ff5a1f,#dc2626)', boxShadow: '0 0 8px rgba(255,90,31,.6)' }} />
      )}
      <span className={`w-4 grid place-items-center shrink-0 transition-colors ${active ? 'text-ember' : 'text-ink-mute group-hover:text-ink-subtle'}`}>
        <Icon name={icon} size={16} />
      </span>
      <span className={`text-[13px] font-condensed font-semibold tracking-wide truncate transition-colors ${active ? 'text-white' : 'group-hover:text-slate-200'}`}>
        {label}
      </span>
    </button>
  );
}

function UserFooter({ user, online, onLogout }) {
  return (
    <div className="border-t border-ink-border p-3 shrink-0">
      <div className="flex items-center gap-2 px-1.5 py-1">
        <Avatar name={user.name} />
        <div className="leading-tight min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white truncate">{user.name}</div>
          <div className="text-[10px] font-condensed text-ink-mute tracking-wide uppercase">{user.role}</div>
        </div>
        <button
          onClick={onLogout}
          title="Cerrar sesión"
          className="p-1.5 rounded-lg hover:bg-white/10 text-ink-mute hover:text-white transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Avatar({ name }) {
  const initials = (name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="w-8 h-8 rounded-lg grid place-items-center font-bold text-xs shrink-0 text-white"
      style={{ background: 'linear-gradient(135deg, #dc2626, #991b1b)' }}>
      {initials}
    </div>
  );
}

function Bars() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
