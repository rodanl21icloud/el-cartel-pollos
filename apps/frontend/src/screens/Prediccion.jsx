import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Predictor de demanda de pollo: cuántos pollos hornear por día para cubrir la
// venta sin sobrar (bajar la merma). Histórico por día de semana ponderado por
// recencia + meta de servicio (cuantil) + ajustes por feriado y clima.
const METAS = [
  { id: 0.5, label: 'Mínima merma', hint: 'mediana' },
  { id: 0.65, label: 'Equilibrado', hint: 'recomendado' },
  { id: 0.85, label: 'Sin quiebres', hint: 'cubre casi todo' },
];

export default function Prediccion() {
  const [weeks, setWeeks] = useState(8);
  const [service, setService] = useState(0.65);
  const [adjust, setAdjust] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    const f = adjust ? 1 : 0;
    api(`/reports/forecast?weeks=${weeks}&service=${service}&rain=${f}&holidays=${f}`)
      .then(setData).catch((e) => setError(e.message === 'PERMISO_DENEGADO' ? 'No tienes permiso para ver la predicción.' : e.message));
  }, [weeks, service, adjust]);

  if (error) return <p className="text-red-600 text-center mt-10">{error}</p>;
  const maxRec = data ? Math.max(1, ...data.per_weekday.map((w) => w.max)) : 1;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-black text-xl">Predicción de horno 🍗</h2>
          <p className="text-sm text-ink-mute">Cuántos pollos hornear para cubrir la venta sin que sobre.</p>
        </div>
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
          {[4, 8, 12].map((w) => (
            <button key={w} onClick={() => setWeeks(w)} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${weeks === w ? 'bg-cartel text-white' : 'text-zinc-600'}`}>{w} sem</button>
          ))}
        </div>
      </div>

      {/* Controles: meta de merma + ajuste clima/feriados */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink-mute">Meta:</span>
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
            {METAS.map((m) => (
              <button key={m.id} onClick={() => setService(m.id)} title={m.hint}
                className={`px-3 py-1.5 rounded-lg font-bold text-sm ${service === m.id ? 'bg-cartel text-white' : 'text-zinc-600'}`}>{m.label}</button>
            ))}
          </div>
        </div>
        <button onClick={() => setAdjust(!adjust)}
          className={`px-3 py-2 rounded-xl font-bold text-sm flex items-center gap-2 ${adjust ? 'bg-ink text-white' : 'bg-white text-zinc-500 shadow'}`}>
          <span>{adjust ? '✓' : '○'}</span> Ajustar por clima y feriados
        </button>
      </div>

      {!data ? <p className="text-zinc-500 text-center mt-10">Calculando predicción…</p> : data.dias_con_venta === 0 ? (
        <p className="text-zinc-500 text-center mt-10">No hay ventas recientes suficientes para predecir.</p>
      ) : (
        <>
          {/* Próximos 7 días */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black">Próximos 7 días</h3>
              {adjust && <span className={`text-xs font-bold ${data.weather_ok ? 'text-emerald-600' : 'text-zinc-400'}`}>{data.weather_ok ? '🌤️ clima en vivo' : '🌤️ clima no disponible'}</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {data.next_7_days.map((d, i) => (
                <div key={d.fecha} className={`rounded-2xl p-3 text-center ${i === 0 ? 'bg-cartel text-white' : 'bg-slate-100'}`}>
                  <div className={`text-xs font-bold ${i === 0 ? 'text-white/80' : 'text-ink-mute'}`}>{d.etiqueta || d.dia}</div>
                  <div className={`text-[10px] ${i === 0 ? 'text-white/70' : 'text-zinc-400'}`}>{d.fecha.slice(8)}/{d.fecha.slice(5, 7)}</div>
                  <div className="text-3xl font-black my-1">{d.recomendado}</div>
                  <div className={`text-[10px] ${i === 0 ? 'text-white/70' : 'text-zinc-400'}`}>pollos</div>
                  {d.recomendado !== d.base && <div className={`text-[10px] ${i === 0 ? 'text-white/70' : 'text-zinc-400'}`}>base {d.base}</div>}
                  {d.feriado && <div className="text-[9px] font-bold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 mt-1 truncate" title={d.feriado}>🎉 {d.feriado}</div>}
                  {d.rain_prob != null && <div className={`text-[10px] mt-0.5 ${i === 0 ? 'text-white/70' : 'text-zinc-400'}`}>🌧️ {d.rain_prob}%{d.temp_max != null ? ` · ${Math.round(d.temp_max)}°` : ''}</div>}
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-mute mt-3">
              <b>Recomendado</b> según tu meta ({METAS.find((m) => m.id === service)?.label}). {adjust ? 'Se ajusta al alza en feriados y días de lluvia.' : 'Activa "clima y feriados" para ajustar días especiales.'}
            </p>
          </div>

          {/* Por día de la semana */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <h3 className="font-black mb-3">Patrón por día de la semana</h3>
            <div className="space-y-2">
              {data.per_weekday.map((w) => (
                <div key={w.dow} className="flex items-center gap-3">
                  <span className="w-10 font-bold text-sm">{w.dia}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-lg relative overflow-hidden">
                    <div className="h-6 bg-cartel/30 absolute left-0 top-0" style={{ width: `${(w.max / maxRec) * 100}%` }} title={`máx ${w.max}`} />
                    <div className="h-6 bg-cartel rounded-r absolute left-0 top-0" style={{ width: `${(w.recomendado / maxRec) * 100}%` }} />
                    <span className="absolute right-2 top-0.5 text-xs font-black text-ink">{w.recomendado} 🍗</span>
                  </div>
                  <span className="w-28 text-right text-xs text-ink-mute">{w.n ? `med ${w.mediana} · máx ${w.max}` : 'sin datos'}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-mute mt-2">Barra sólida = recomendado · barra clara = máximo histórico. Base: {weeks} semanas.</p>
          </div>

          {/* Mix de presas */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <h3 className="font-black mb-3">Mix de productos de pollo (demanda diaria media)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead><tr className="text-left text-ink-mute border-b"><th className="p-2">Producto</th><th className="text-right">Pollo/u</th><th className="text-right">Unid./día</th></tr></thead>
                <tbody>
                  {data.por_producto.map((p) => (
                    <tr key={p.name} className="border-b last:border-0">
                      <td className="p-2 font-semibold">{p.name}</td>
                      <td className="text-right text-zinc-500">{p.pollo}</td>
                      <td className="text-right font-bold tabular-nums">{p.por_dia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-mute mt-2">Te orienta el corte: enteros vs. presas (1/4, medio). Promedio de los {data.dias_con_venta} días con venta.</p>
          </div>
        </>
      )}
    </div>
  );
}
