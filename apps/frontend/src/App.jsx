import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { api, getToken } from './lib/api.js';
import { useSession } from './store/session.js';
import { NAV, itemByKey } from './config/nav.js';
import { Icon } from './config/icons.jsx';
import { roleLabel } from './config/roles.js';
import { BRAND_NAME, IS_DEFAULT_BRAND, brandLines, BRAND_LOGO } from './config/brand.js';
import { Forbidden, Spinner } from './components/ui/States.jsx';
// Eager: pantallas críticas / offline-first (deben cargar sin red desde cero).
import Login from './screens/Login.jsx';
import Home from './screens/Home.jsx';
import Pos from './screens/Pos.jsx';
// Lazy: el resto se divide en chunks por ruta (code-splitting).
const CashClose = lazy(() => import('./screens/CashClose.jsx'));
const Merma = lazy(() => import('./screens/Merma.jsx'));
const Gastos = lazy(() => import('./screens/Gastos.jsx'));
const Flujo = lazy(() => import('./screens/Flujo.jsx'));
const Pnl = lazy(() => import('./screens/Pnl.jsx'));
const Estadisticas = lazy(() => import('./screens/Estadisticas.jsx'));
const Movimientos = lazy(() => import('./screens/Movimientos.jsx'));
const Prediccion = lazy(() => import('./screens/Prediccion.jsx'));
const Resumen = lazy(() => import('./screens/Resumen.jsx'));
const Cuadre = lazy(() => import('./screens/Cuadre.jsx'));
const Finanzas = lazy(() => import('./screens/Finanzas.jsx'));
const CentroOperaciones = lazy(() => import('./screens/CentroOperaciones.jsx'));
const Comercial = lazy(() => import('./screens/Comercial.jsx'));
const Winback = lazy(() => import('./screens/Winback.jsx'));
const VentasHub = lazy(() => import('./screens/stations/VentasHub.jsx'));
const CocinaHub = lazy(() => import('./screens/stations/CocinaHub.jsx'));
const FinanzasHub = lazy(() => import('./screens/stations/FinanzasHub.jsx'));
const Banco = lazy(() => import('./screens/Banco.jsx'));
const Ventas = lazy(() => import('./screens/Ventas.jsx'));
const VentaRetroactiva = lazy(() => import('./screens/VentaRetroactiva.jsx'));
const Permisos = lazy(() => import('./screens/Permisos.jsx'));
const Inventario = lazy(() => import('./screens/Inventario.jsx'));
const PreciosInsumos = lazy(() => import('./screens/PreciosInsumos.jsx'));
const Carta = lazy(() => import('./screens/Carta.jsx'));
const Cartelera = lazy(() => import('./screens/Cartelera.jsx'));
const Modificadores = lazy(() => import('./screens/Modificadores.jsx'));
const Despacho = lazy(() => import('./screens/Despacho.jsx'));
const Kds = lazy(() => import('./screens/Kds.jsx'));
const Ajustes = lazy(() => import('./screens/Ajustes.jsx'));
const Clientes = lazy(() => import('./screens/Clientes.jsx'));
const Usuarios = lazy(() => import('./screens/Usuarios.jsx'));
const Auditoria = lazy(() => import('./screens/Auditoria.jsx'));

// Inactividad: cierra sesión tras 30 min sin actividad (operación de caja).
const IDLE_MS = 8 * 60 * 60 * 1000; // 8 horas (un turno completo)

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  // La pantalla activa se deriva de la URL (primer segmento). '/' -> 'home'.
  const screen = location.pathname === '/' ? 'home' : location.pathname.split('/')[1];
  // Sesión + permisos centralizados en el store global (zustand).
  const { user, perms, booting, sessionMsg, setSessionMsg, restore, login, logout } = useSession();
  const [online, setOnline] = useState(navigator.onLine);
  const [drawer, setDrawer] = useState(false);
  const [alerts, setAlerts] = useState([]); // alertas operativas del día (centro de mando)
  const idleTimer = useRef(null);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Restaurar la sesión al recargar (la URL actual se conserva: deep-link / refresh).
  useEffect(() => { restore(); }, [restore]);

  // Alertas operativas para badges de navegación (solo quien ve el centro de mando).
  useEffect(() => {
    if (!user || !perms['reports.view']) { setAlerts([]); return; }
    let alive = true;
    const load = () => api('/today').then((d) => alive && setAlerts(d.alerts || [])).catch(() => {});
    load();
    const t = setInterval(load, 90000);
    return () => { alive = false; clearInterval(t); };
  }, [user, perms]);

  async function handleLogin(username, password) {
    const path = await login(username, password);
    navigate(path);
  }
  function go(key) { navigate(key === 'home' ? '/' : `/${key}`); setDrawer(false); }

  // Seguridad de sesión: cierre por 401 global y por inactividad.
  useEffect(() => {
    const onExpired = () => { if (getToken()) logout('Tu sesión expiró. Inicia sesión de nuevo.'); };
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, [logout]);
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
        <img src={BRAND_LOGO} alt="" className="w-40 rounded-xl animate-pulse" />
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
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => perms[i.perm] && !i.hidden) })).filter((g) => g.items.length);

  // Guard de permiso por ruta (defensa además del filtro de menú). Las pantallas
  // que no son ítems de menú (sin entrada en NAV) las refuerza el backend.
  const guard = (key, el) => {
    const it = itemByKey(key);
    return it && !perms[it.perm] ? <Forbidden module={it.label.toLowerCase()} /> : el;
  };

  // Badges de alerta en la navegación: nivel por ítem (rojo>ámbar). Las alertas
  // de rutas hijas también marcan su estación contenedora.
  const HUB_BY_ROUTE = {
    pos: 'ventashub', ventas: 'ventashub', operaciones: 'ventashub', retroactiva: 'ventashub', clientes: 'ventashub',
    kds: 'cocinahub', despacho: 'cocinahub', prediccion: 'cocinahub', merma: 'cocinahub',
    cash: 'finanzashub', cuadre: 'finanzashub', finanzas: 'finanzashub', movimientos: 'finanzashub',
  };
  const navBadges = {};
  for (const a of alerts) {
    const lvl = a.level === 'red' ? 'red' : 'amber';
    const set = (k) => { if (k) navBadges[k] = navBadges[k] === 'red' ? 'red' : lvl; };
    set(a.route); set(HUB_BY_ROUTE[a.route]);
  }
  const totalAlerts = alerts.length;
  const topLevel = alerts.some((a) => a.level === 'red') ? 'red' : (alerts.length ? 'amber' : null);

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
        <NavList groups={groups} screen={screen} onGo={go} badges={navBadges} totalAlerts={totalAlerts} topLevel={topLevel} />
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
            <NavList groups={groups} screen={screen} onGo={go} badges={navBadges} totalAlerts={totalAlerts} topLevel={topLevel} />
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
                {current?.label || 'Hoy'}
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
          {!groups.length && <p className="text-center text-ink-mute mt-12">No tienes módulos habilitados. Contacta a un administrador.</p>}
          <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Home role={user.role} onGo={go} userName={user.name} />} />
            <Route path="/ventashub" element={guard('ventashub', <VentasHub onGo={go} user={user} perms={perms} />)} />
            <Route path="/cocinahub" element={guard('cocinahub', <CocinaHub perms={perms} />)} />
            <Route path="/finanzashub" element={guard('finanzashub', <FinanzasHub onGo={go} user={user} role={user.role} perms={perms} />)} />
            <Route path="/operaciones" element={guard('operaciones', <CentroOperaciones />)} />
            <Route path="/pos" element={guard('pos', <Pos onNavigate={go} />)} />
            <Route path="/ventas" element={guard('ventas', <Ventas canVoid={!!perms['sales.void']} />)} />
            <Route path="/retroactiva" element={guard('retroactiva', <VentaRetroactiva user={user} />)} />
            <Route path="/despacho" element={guard('despacho', <Despacho />)} />
            <Route path="/kds" element={guard('kds', <Kds />)} />
            <Route path="/prediccion" element={guard('prediccion', <Prediccion />)} />
            <Route path="/clientes" element={guard('clientes', <Clientes />)} />
            <Route path="/gastos" element={guard('gastos', <Gastos />)} />
            <Route path="/merma" element={guard('merma', <Merma />)} />
            <Route path="/inventario" element={guard('inventario', <Inventario />)} />
            <Route path="/precios" element={guard('precios', <PreciosInsumos />)} />
            <Route path="/cash" element={guard('cash', <CashClose userName={user.name} />)} />
            <Route path="/finanzas" element={guard('finanzas', <Finanzas role={user.role} />)} />
            <Route path="/comercial" element={guard('comercial', <Comercial />)} />
            <Route path="/winback" element={guard('winback', <Winback />)} />
            <Route path="/resumen" element={guard('resumen', <Resumen role={user.role} />)} />
            <Route path="/cuadre" element={guard('cuadre', <Cuadre />)} />
            <Route path="/movimientos" element={guard('movimientos', <Movimientos onGo={go} canVoid={!!perms['sales.void']} />)} />
            <Route path="/estadisticas" element={guard('estadisticas', <Estadisticas />)} />
            <Route path="/banco" element={guard('banco', <Banco role={user.role} />)} />
            <Route path="/flujo" element={guard('flujo', <Flujo role={user.role} />)} />
            <Route path="/pnl" element={guard('pnl', <Pnl role={user.role} />)} />
            <Route path="/carta" element={guard('carta', <Carta role={user.role} />)} />
            <Route path="/cartelera" element={guard('cartelera', <Cartelera />)} />
            <Route path="/modificadores" element={guard('modificadores', <Modificadores role={user.role} />)} />
            <Route path="/ajustes" element={guard('ajustes', <Ajustes role={user.role} />)} />
            <Route path="/usuarios" element={guard('usuarios', <Usuarios />)} />
            <Route path="/permisos" element={guard('permisos', <Permisos />)} />
            <Route path="/auditoria" element={guard('auditoria', <Auditoria />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function Brand({ onClose }) {
  // Branding por instancia: default = "EL CARTEL / de los Pollos"; custom = nombre.
  const { head, last } = brandLines();
  return (
    <div className="h-14 flex items-center gap-2.5 px-4 border-b border-ink-border shrink-0">
      <img src={BRAND_LOGO} alt={BRAND_NAME} className="h-8 rounded-md" />
      <div className="min-w-0 flex-1">
        {IS_DEFAULT_BRAND ? (
          <>
            <div className="font-display text-white text-sm leading-none tracking-wide truncate">EL CARTEL</div>
            <div className="text-[9px] font-condensed text-ink-mute tracking-[0.2em] uppercase leading-none mt-0.5">de los Pollos</div>
          </>
        ) : (
          <>
            <div className="font-display text-white text-sm leading-none tracking-wide truncate">{head || last}</div>
            {head && <div className="text-[9px] font-condensed text-ink-mute tracking-[0.2em] uppercase leading-none mt-0.5">{last}</div>}
          </>
        )}
      </div>
      {onClose && (
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-ink-mute shrink-0">✕</button>
      )}
    </div>
  );
}

function NavList({ groups, screen, onGo, badges = {}, totalAlerts = 0, topLevel }) {
  return (
    <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4">
      {/* Inicio */}
      <NavButton
        icon="home"
        label="Hoy"
        active={screen === 'home'}
        onClick={() => onGo('home')}
        badge={topLevel}
        count={totalAlerts}
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
                badge={badges[i.key]}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NavButton({ icon, label, active, onClick, badge, count }) {
  const showCount = count != null && count > 0;
  const dot = badge === 'red' ? 'bg-red-500' : 'bg-amber-400';
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
      {/* Badge de alerta: contador (Hoy) o punto de color (ítems) */}
      {showCount ? (
        <span className={`ml-auto shrink-0 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[10px] font-black text-white ${badge === 'red' ? 'bg-red-500' : 'bg-amber-400'}`}>{count}</span>
      ) : badge ? (
        <span className={`ml-auto shrink-0 w-2 h-2 rounded-full ${dot}`} />
      ) : null}
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
