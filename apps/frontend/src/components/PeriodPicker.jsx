import { useState } from 'react';
import { presetRange, customRange, PRESETS } from '../lib/period.js';

// Selector de periodo reutilizable: Hoy / Semana / Mes / Año / Personalizado.
// Emite { id, from, to } (ISO) vía onChange.
export default function PeriodPicker({ value, onChange }) {
  const [cf, setCf] = useState('');
  const [ct, setCt] = useState('');
  const id = value?.id || 'mes';

  function pick(pid) {
    if (pid === 'custom') {
      if (cf && ct) onChange({ id: 'custom', ...customRange(cf, ct) });
      else onChange({ id: 'custom', ...presetRange('mes') });
    } else onChange({ id: pid, ...presetRange(pid) });
  }
  function applyCustom(nf, nt) {
    setCf(nf); setCt(nt);
    if (nf && nt) onChange({ id: 'custom', ...customRange(nf, nt) });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
        {PRESETS.map(([pid, label]) => (
          <button key={pid} onClick={() => pick(pid)}
            className={`px-3 py-1.5 rounded-lg font-bold text-sm whitespace-nowrap ${id === pid ? 'bg-cartel text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
            {label}
          </button>
        ))}
      </div>
      {id === 'custom' && (
        <div className="flex items-center gap-1 bg-white rounded-xl p-1.5 shadow">
          <input type="date" value={cf} onChange={(e) => applyCustom(e.target.value, ct)} className="text-sm px-2 py-1 rounded-lg border border-zinc-200 outline-none" />
          <span className="text-zinc-400 text-sm">→</span>
          <input type="date" value={ct} onChange={(e) => applyCustom(cf, e.target.value)} className="text-sm px-2 py-1 rounded-lg border border-zinc-200 outline-none" />
        </div>
      )}
    </div>
  );
}
