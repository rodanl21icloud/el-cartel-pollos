import { useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api.js';
import { presetRange } from '../lib/period.js';
import PeriodPicker from '../components/PeriodPicker.jsx';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

export default function Estadisticas() {
  const [period, setPeriod] = useState({ id: 'mes', ...presetRange('mes') });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setData(null); setError('');
    const p = new URLSearchParams({ from: period.from, to: period.to });
    api(`/reports/stats?${p}`).then(setData).catch((e) => setError(e.message));
  }, [period]);

  async function descargar(tipo) {
    setDownloading(true);
    try { await apiDownload(`/reports/export?type=${tipo}&from=${period.from}&to=${period.to}`, `${tipo}_${period.from.slice(0, 10)}.csv`); }
    catch (e) { setError(e.message); } finally { setDownloading(false); }
  }

  if (error) return <p className="text-red-600 text-center mt-10">{error === 'PERMISO_DENEGADO' ? 'No tienes permiso para ver estadísticas.' : error}</p>;

  const maxHora = data ? Math.max(1, ...data.por_hora.map((h) => h.monto)) : 1;
  const horasActivas = data ? data.por_hora.filter((h) => h.monto > 0) : [];
  const maxRankMonto = data ? Math.max(1, ...data.ranking.map((r) => r.monto)) : 1;
  const cmp = data?.comparativo;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">Estadísticas</h2>
        <button onClick={() => descargar('productos')} disabled={downloading || !data}
          className="px-4 py-2 rounded-xl bg-ink text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
          <span>⤓</span> {downloading ? 'Generando…' : 'Descargar reporte'}
        </button>
      </div>

      <PeriodPicker value={period} onChange={setPeriod} />

      {!data ? <p className="text-zinc-500 text-center mt-10">Cargando estadísticas…</p> : (
        <>
          {/* Cards con comparación vs período anterior */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <BigCard label="Total ventas" value={money(data.total_ventas)} delta={cmp?.delta_total} />
            <BigCard label="N° de ventas" value={data.n_ventas} delta={cmp?.delta_n} />
            <BigCard label="Ticket promedio" value={money(data.ticket_promedio)} />
          </div>

          {/* Ventas por hora */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <h3 className="font-black mb-3">Ventas por hora</h3>
            {horasActivas.length ? (
              <div className="flex items-end gap-1 h-40">
                {data.por_hora.map((h) => (
                  <div key={h.hora} className="flex-1 flex flex-col items-center justify-end group">
                    <div className="w-full bg-cartel/80 rounded-t hover:bg-cartel transition" style={{ height: `${(h.monto / maxHora) * 100}%` }}
                      title={`${h.hora}:00 · ${money(h.monto)} (${h.ventas})`} />
                    <span className="text-[9px] text-zinc-400 mt-1">{h.hora}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-zinc-400">Sin ventas en el período.</p>}
            <p className="text-xs text-zinc-400 mt-2">Hora local (Chile). Pasa el cursor para ver el monto.</p>
          </div>

          {/* Detalle de productos vendidos */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-black">Detalle de productos vendidos</h3>
              <span className="text-xs text-ink-mute">{data.ranking.length} productos</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead><tr className="text-left text-ink-mute border-b">
                  <th className="p-2">Producto</th><th className="text-right">Total ventas</th><th className="text-right">Unidades</th>
                </tr></thead>
                <tbody>
                  {data.ranking.map((r, i) => (
                    <tr key={r.name} className="border-b last:border-0">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{r.name}</span>
                          {i === 0 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full whitespace-nowrap">⭐ Producto estrella</span>}
                        </div>
                        <div className="h-1.5 bg-zinc-100 rounded-full mt-1 max-w-[220px]"><div className="h-1.5 bg-cartel rounded-full" style={{ width: `${(r.monto / maxRankMonto) * 100}%` }} /></div>
                      </td>
                      <td className="text-right font-bold tabular-nums whitespace-nowrap">{money(r.monto)}</td>
                      <td className="text-right tabular-nums text-zinc-600">{r.unidades}</td>
                    </tr>
                  ))}
                  {!data.ranking.length && <tr><td colSpan="3" className="p-3 text-center text-zinc-400">Sin ventas en el período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Por método de pago */}
          <div className="bg-white rounded-2xl p-4 shadow">
            <h3 className="font-black mb-3">Por método de pago</h3>
            <ul className="space-y-2">
              {data.por_metodo.map((m) => (
                <li key={m.metodo} className="flex justify-between">
                  <span className="font-semibold">{m.metodo}</span>
                  <span className="text-zinc-600">{m.ventas} vta · <b>{money(m.monto)}</b></span>
                </li>
              ))}
              {!data.por_metodo.length && <li className="text-zinc-400">Sin datos.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function BigCard({ label, value, delta }) {
  const has = delta != null;
  const up = has && delta >= 0;
  return (
    <div className="bg-white rounded-2xl p-4 shadow">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-black text-cartel mt-0.5">{value}</div>
      {has ? (
        <div className={`text-xs font-bold mt-1 inline-flex items-center gap-1 ${up ? 'text-emerald-600' : 'text-red-500'}`}>
          {up ? '▲' : '▼'} {Math.abs(delta)}% <span className="text-ink-mute font-normal">vs período anterior</span>
        </div>
      ) : <div className="text-xs text-ink-mute mt-1">Sin período anterior comparable</div>}
    </div>
  );
}
