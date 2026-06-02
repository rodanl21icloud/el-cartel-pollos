import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Predictor de demanda de pollo: cuántos pollos hornear por día para cubrir la
// venta sin sobrar (bajar la merma). Usa el histórico por día de la semana,
// ponderado por recencia.
export default function Prediccion() {
  const [weeks, setWeeks] = useState(8);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null); setError('');
    api(`/reports/forecast?weeks=${weeks}`).then(setData).catch((e) => setError(e.message === 'PERMISO_DENEGADO' ? 'No tienes permiso para ver la predicción.' : e.message));
  }, [weeks]);

  if (error) return <p className="text-red-600 text-center mt-10">{error}</p>;

  const maxRec = data ? Math.max(1, ...data.per_weekday.map((w) => w.max)) : 1;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-black text-xl">Predicción de horno 🍗</h2>
          <p className="text-sm text-ink-mute">Cuántos pollos hornear para cubrir la venta sin que sobre.</p>
        </div>
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
          {[4, 8, 12].map((w) => (
            <button key={w} onClick={() => setWeeks(w)}
              className={`px-3 py-1.5 rounded-lg font-bold text-sm ${weeks === w ? 'bg-cartel text-white' : 'text-zinc-600'}`}>{w} sem</button>
          ))}
        </div>
      </div>

      {!data ? <p className="text-zinc-500 text-center mt-10">Calculando predicción…</p> : data.dias_con_venta === 0 ? (
        <p className="text-zinc-500 text-center mt-10">No hay ventas recientes suficientes para predecir.</p>
      ) : (
        <>
          {/* Próximos 7 días */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <h3 className="font-black mb-3">Próximos 7 días</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {data.next_7_days.map((d, i) => (
                <div key={d.fecha} className={`rounded-2xl p-3 text-center ${i === 0 ? 'bg-cartel text-white' : 'bg-slate-100'}`}>
                  <div className={`text-xs font-bold ${i === 0 ? 'text-white/80' : 'text-ink-mute'}`}>{d.etiqueta || d.dia}</div>
                  <div className={`text-[10px] ${i === 0 ? 'text-white/70' : 'text-zinc-400'}`}>{d.fecha.slice(8)}/{d.fecha.slice(5, 7)}</div>
                  <div className="text-3xl font-black my-1">{d.recomendado}</div>
                  <div className={`text-[10px] ${i === 0 ? 'text-white/70' : 'text-zinc-400'}`}>pollos</div>
                  <div className={`text-[10px] mt-1 ${i === 0 ? 'text-white/60' : 'text-zinc-400'}`}>prom {d.promedio} · máx {d.max}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-mute mt-3">
              <b>Recomendado</b> = demanda típica de ese día (ponderada hacia las semanas recientes). Si quieres
              cero quiebres de stock acércate al <b>máximo</b>; para minimizar merma, quédate en el recomendado.
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
                  <span className="w-24 text-right text-xs text-ink-mute">{w.n ? `${w.n} días · máx ${w.max}` : 'sin datos'}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-mute mt-2">Barra sólida = recomendado · barra clara = máximo histórico. Basado en {weeks} semanas.</p>
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
            <p className="text-xs text-ink-mute mt-2">Te orienta el corte: enteros vs. presas (1/4, medio). Promedio diario de los {data.dias_con_venta} días con venta.</p>
          </div>
        </>
      )}
    </div>
  );
}
