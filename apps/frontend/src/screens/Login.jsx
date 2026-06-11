import { useState } from 'react';
import { BRAND_NAME, IS_DEFAULT_BRAND, brandLines } from '../config/brand.js';

/* -----------------------------------------------------------------------
   LOGIN — Estética "La Parrilla Subterránea"
   Oscuro, industrial, con carácter de street food chileno.
   Bebas Neue para el display. Barlow Condensed para UI. DM Mono para datos.
   Grain texture + ember glow para atmósfera de brasas.
----------------------------------------------------------------------- */

export default function Login({ onLogin, notice }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      if (err.message === 'CREDENCIALES_INVALIDAS') {
        setError('Usuario o contraseña incorrectos');
      } else if (['TOKEN_AUSENTE', 'TOKEN_INVALIDO', 'NO_AUTENTICADO'].includes(err.message)) {
        setError('Error de sesión. Intenta de nuevo.');
      } else if (err.message === 'ERROR_INTERNO_LOGIN') {
        setError('Error interno del servidor. Contacta al administrador.');
      } else {
        setError(err.message || 'Error de conexión');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-ink overflow-hidden relative">

      {/* ── Grain texture overlay ── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.045]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px',
          animation: 'grain 8s steps(1) infinite',
          mixBlendMode: 'overlay',
        }}
      />

      {/* ── Panel izquierdo — identidad visual (solo desktop) ── */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden select-none">

        {/* Ember glow desde abajo */}
        <div
          aria-hidden
          className="absolute bottom-0 left-0 right-0 h-[500px] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 40% 115%, rgba(220,38,38,0.38) 0%, rgba(255,69,0,0.12) 45%, transparent 72%)',
          }}
        />
        {/* Glow tenue en esquina superior */}
        <div
          aria-hidden
          className="absolute -top-20 -right-20 w-96 h-96 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(220,38,38,0.07) 0%, transparent 70%)',
          }}
        />

        {/* Grid pattern sutil */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        {/* Contenido */}
        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          {/* Logo arriba */}
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt={BRAND_NAME} className="h-10 rounded-lg" />
          </div>

          {/* Headline central */}
          <div>
            <div className="mb-5">
              <span
                className="inline-block text-cartel text-xs font-condensed font-bold tracking-[0.3em] uppercase
                           px-3 py-1 border border-cartel/40 rounded-sm"
              >
                Sistema de gestión · POS
              </span>
            </div>
            <h1
              className="font-display text-white leading-none mb-6"
              style={{ fontSize: 'clamp(3.4rem, 6.5vw, 7rem)' }}
            >
              {IS_DEFAULT_BRAND ? (
                <>
                  EL CARTEL<br />
                  <span className="text-cartel" style={{ animation: 'flicker 7s infinite' }}>DE LOS</span>
                  <br />POLLOS
                </>
              ) : (
                <>
                  {brandLines().head}{brandLines().head ? <br /> : null}
                  <span className="text-cartel" style={{ animation: 'flicker 7s infinite' }}>{brandLines().last}</span>
                </>
              )}
            </h1>
            <p className="text-ink-subtle font-condensed text-xl tracking-wide max-w-xs leading-relaxed">
              Control total de tu operación.
              Inventario, caja, despacho y finanzas — todo en uno.
            </p>
          </div>

          {/* Footer izquierdo */}
          <div className="flex items-center gap-4">
            <div className="h-px flex-1 bg-ink-border" />
            <span className="text-ink-mute text-xs font-mono tracking-widest uppercase">
              Delivery-only · Offline-first
            </span>
            <div className="h-px flex-1 bg-ink-border" />
          </div>
        </div>
      </div>

      {/* ── Panel derecho — formulario ── */}
      <div
        className="w-full lg:w-[420px] xl:w-[460px] shrink-0 flex flex-col justify-center
                   relative bg-ink-soft border-l border-ink-border"
      >
        {/* Línea de acento arriba */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cartel to-transparent" />

        {/* Mobile: logo centrado */}
        <div className="lg:hidden flex justify-center pt-12 pb-0 px-8">
          <img src="/logo.jpeg" alt="El Cartel de los Pollos" className="h-16 rounded-xl" />
        </div>

        <form onSubmit={submit} className="p-8 xl:p-10" style={{ animation: 'fadein .4s ease' }}>

          {/* Título del formulario */}
          <div className="mb-8">
            <h2
              className="font-display text-white tracking-wide"
              style={{ fontSize: '2.5rem', lineHeight: 1 }}
            >
              ACCESO
            </h2>
            <p className="text-ink-subtle text-sm mt-1.5 font-condensed tracking-wide">
              Ingresa tus credenciales para continuar
            </p>
          </div>

          {/* Notice de sesión expirada */}
          {notice && (
            <div className="mb-5 flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg px-4 py-3">
              <span className="text-amber-400 mt-0.5 shrink-0 text-base">⚠</span>
              <p className="text-amber-300 text-sm font-medium leading-snug">{notice}</p>
            </div>
          )}

          {/* Campo usuario */}
          <div className="mb-4">
            <label className="block text-[11px] font-condensed font-bold tracking-[0.2em] uppercase text-ink-subtle mb-2">
              Usuario
            </label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tu_usuario"
              className="w-full px-4 py-3 rounded-lg bg-ink-mid border border-ink-border
                         text-white text-base outline-none font-sans
                         placeholder:text-ink-mute
                         focus:border-cartel focus:ring-1 focus:ring-cartel/30 transition"
            />
          </div>

          {/* Campo contraseña */}
          <div className="mb-6">
            <label className="block text-[11px] font-condensed font-bold tracking-[0.2em] uppercase text-ink-subtle mb-2">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg bg-ink-mid border border-ink-border
                         text-white text-base outline-none font-sans
                         placeholder:text-ink-mute
                         focus:border-cartel focus:ring-1 focus:ring-cartel/30 transition"
            />
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="mb-4 flex items-center gap-2.5 text-sm font-medium text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
              {error}
            </div>
          )}

          {/* Botón principal */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-lg font-condensed font-bold text-lg
                       tracking-[0.1em] uppercase transition-all duration-150
                       active:scale-[.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: loading
                ? '#991b1b'
                : 'linear-gradient(135deg, #dc2626 0%, #b91c1c 55%, #991b1b 100%)',
              color: '#fff',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(220,38,38,0.35)',
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Ingresando...
              </span>
            ) : 'Ingresar'}
          </button>

          {/* Footer del form */}
          <div className="mt-8 pt-5 border-t border-ink-border flex items-center justify-between">
            <span className="text-ink-mute text-xs font-mono tracking-wider">POS · v2.0</span>
            <div className="flex gap-1.5">
              {[...Array(3)].map((_, i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-ink-border" />
              ))}
            </div>
          </div>
        </form>

        {/* Línea de acento abajo */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cartel/30 to-transparent" />
      </div>
    </div>
  );
}
