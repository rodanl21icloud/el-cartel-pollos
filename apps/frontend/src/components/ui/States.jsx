// ============================================================
// Estados del sistema reutilizables (defensive UX). Consistentes en toda la app:
// cargando, vacío, error, sin permiso. Pragmáticos y sobrios para POS.
// ============================================================

export function Spinner({ label = 'Cargando…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-ink-mute py-10 ${className}`}>
      <span className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-cartel animate-spin" />
      <span className="font-semibold">{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '📭', title = 'Sin datos', hint, action }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-2 opacity-70">{icon}</div>
      <div className="font-black text-slate-700">{title}</div>
      {hint && <p className="text-sm text-ink-mute mt-1 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const msg = humanizeError(error);
  return (
    <div className="text-center py-12 px-4">
      <div className="text-4xl mb-2">⚠️</div>
      <div className="font-black text-slate-700">Algo salió mal</div>
      <p className="text-sm text-red-600 mt-1">{msg}</p>
      {onRetry && <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-xl bg-ink text-white font-bold text-sm">Reintentar</button>}
    </div>
  );
}

export function Forbidden({ module }) {
  return (
    <EmptyState icon="🔒" title="Acceso restringido"
      hint={`No tienes permiso para ${module || 'esta sección'}. Pídele acceso a un administrador.`} />
  );
}

// Traduce códigos de error del backend a mensajes claros en español.
const ERROR_MAP = {
  PERMISO_DENEGADO: 'No tienes permiso para esta acción.',
  TOKEN_AUSENTE: 'Tu sesión expiró. Inicia sesión de nuevo.',
  TOKEN_INVALIDO: 'Tu sesión expiró. Inicia sesión de nuevo.',
  CREDENCIALES_INVALIDAS: 'Usuario o contraseña incorrectos.',
  STOCK_INSUFICIENTE: 'No hay stock suficiente de un insumo.',
  CAJA_CERRADA: 'La caja está cerrada. Ábrela para continuar.',
  CAJA_YA_ABIERTA: 'Ya hay una caja abierta.',
  PIN_INVALIDO: 'PIN incorrecto.',
  PIN_NO_CONFIGURADO: 'No hay PIN de administrador configurado.',
  SESION_NO_VALIDA: 'Sesión de firma no válida. Vuelve a iniciar sesión.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Espera unos minutos.',
  OTP_GERENCIA_REQUERIDO: 'Esta acción requiere el OTP de gerencia.',
  OTP_INVALIDO: 'OTP incorrecto.',
};
export function humanizeError(e) {
  const code = typeof e === 'string' ? e : (e?.message || '');
  return ERROR_MAP[code] || (code && !/^[A-Z_]+$/.test(code) ? code : 'Ocurrió un error. Intenta nuevamente.');
}
