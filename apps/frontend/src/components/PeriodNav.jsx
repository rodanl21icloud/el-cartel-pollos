import { useState, useEffect } from 'react';

// Navegación temporal: pestañas Día / Mes / Año / Personalizado + botones
// ◀ Anterior / Siguiente ▶ que se desplazan por períodos correlativos.
// Emite { id, from, to, label } (ISO) vía onChange en cada cambio.
const LEVELS = [['dia', 'Día'], ['mes', 'Mes'], ['anio', 'Año'], ['custom', 'Personalizado']];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function rangeFor(level, anchor) {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate();
  if (level === 'dia') {
    const from = new Date(y, m, d, 0, 0, 0, 0), to = new Date(y, m, d, 23, 59, 59, 999);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const same = from.getTime() === today.getTime();
    return { from, to, label: same ? 'Hoy' : cap(anchor.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })) };
  }
  if (level === 'mes') {
    const from = new Date(y, m, 1, 0, 0, 0, 0), to = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { from, to, label: cap(anchor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })) };
  }
  // anio
  const from = new Date(y, 0, 1, 0, 0, 0, 0), to = new Date(y, 11, 31, 23, 59, 59, 999);
  return { from, to, label: String(y) };
}

function shift(level, anchor, dir) {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate();
  if (level === 'dia') return new Date(y, m, d + dir);
  if (level === 'mes') return new Date(y, m + dir, 1);
  return new Date(y + dir, 0, 1);
}

export default function PeriodNav({ onChange }) {
  const [level, setLevel] = useState('mes');
  const [anchor, setAnchor] = useState(new Date());
  const [cf, setCf] = useState('');
  const [ct, setCt] = useState('');

  // Emite el rango actual ante cualquier cambio.
  useEffect(() => {
    if (level === 'custom') {
      if (cf && ct) onChange({ id: 'custom', from: new Date(`${cf}T00:00:00`).toISOString(), to: new Date(`${ct}T23:59:59.999`).toISOString(), label: `${cf} → ${ct}` });
      return;
    }
    const { from, to, label } = rangeFor(level, anchor);
    onChange({ id: level, from: from.toISOString(), to: to.toISOString(), label });
  }, [level, anchor, cf, ct]);

  // Deshabilitar "Siguiente" si el período próximo empieza en el futuro.
  const nextDisabled = level !== 'custom' && rangeFor(level, shift(level, anchor, +1)).from > Date.now() + 0 && shift(level, anchor, +1) > new Date();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
        {LEVELS.map(([id, lbl]) => (
          <button key={id} onClick={() => { setLevel(id); if (id !== 'custom') setAnchor(new Date()); }}
            className={`px-3 py-1.5 rounded-lg font-bold text-sm whitespace-nowrap ${level === id ? 'bg-cartel text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{lbl}</button>
        ))}
      </div>

      {level === 'custom' ? (
        <div className="flex items-center gap-1 bg-white rounded-xl p-1.5 shadow">
          <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="text-sm px-2 py-1 rounded-lg border border-zinc-200 outline-none" />
          <span className="text-zinc-400 text-sm">→</span>
          <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="text-sm px-2 py-1 rounded-lg border border-zinc-200 outline-none" />
        </div>
      ) : (
        <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow">
          <button onClick={() => setAnchor(shift(level, anchor, -1))} title="Anterior" className="w-9 h-9 rounded-lg hover:bg-zinc-100 font-black text-zinc-600">◀</button>
          <span className="px-3 min-w-[120px] text-center font-black text-ink capitalize">{rangeFor(level, anchor).label}</span>
          <button onClick={() => !nextDisabled && setAnchor(shift(level, anchor, +1))} disabled={nextDisabled}
            title="Siguiente" className={`w-9 h-9 rounded-lg font-black ${nextDisabled ? 'text-zinc-300' : 'hover:bg-zinc-100 text-zinc-600'}`}>▶</button>
        </div>
      )}
    </div>
  );
}
