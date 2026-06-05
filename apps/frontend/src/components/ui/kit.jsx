// ============================================================
// Kit de componentes canónicos (Fase 2). Una sola fuente para
// encabezados, KPIs, badges y secciones -> consistencia en toda la app.
// Color por severidad ÚNICO: ok=verde · warn=ámbar · bad=rojo · neutral.
// ============================================================

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <h2 className="font-black text-2xl text-ink leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-ink-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Section({ title, right, className = '', children }) {
  return (
    <div className={`card p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          {title && <h3 className="font-black">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

// Variación con flecha + color (verde mejora / rojo caída). invert: menos es mejor.
export function Delta({ value, invert, suffix = '%' }) {
  if (value == null) return <span className="text-[11px] text-ink-mute">sin base</span>;
  const up = value >= 0, good = invert ? !up : up;
  return <span className={`text-xs font-bold ${good ? 'text-emerald-600' : 'text-cartel'}`}>{up ? '▲' : '▼'} {Math.abs(value)}{suffix}</span>;
}

export function KpiCard({ label, value, delta, invert, hint, big, alert }) {
  return (
    <div className={`card p-4 ${alert ? 'ring-1 ring-cartel/40' : ''}`}>
      <div className="text-[11px] text-ink-mute uppercase tracking-wide">{label}</div>
      <div className={`font-black tabular-nums ${alert ? 'text-cartel' : 'text-ink'} ${big ? 'text-3xl' : 'text-2xl'}`}>{value}</div>
      <div className="mt-0.5">
        {delta !== undefined ? <Delta value={delta} invert={invert} /> : hint ? <span className="text-[11px] text-ink-mute">{hint}</span> : null}
      </div>
    </div>
  );
}

const TONES = {
  ok: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  warn: 'bg-amber-100 text-amber-700 border-amber-300',
  bad: 'bg-red-100 text-red-700 border-red-300',
  neutral: 'bg-zinc-100 text-zinc-600 border-zinc-300',
};
export function Badge({ tone = 'neutral', children }) {
  return <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${TONES[tone] || TONES.neutral}`}>{children}</span>;
}
