import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const RANGES = [
  { id: '1', label: 'Hoy', days: 1 },
  { id: '7', label: '7 días', days: 7 },
  { id: '30', label: '30 días', days: 30 },
];

export default function Estadisticas({ role }) {
  const [data, setData] = useState(null);
  const [range, setRange] = useState('7');
  const [error, setError] = useState('');

  useEffect(() => {
    if (role !== 'GERENCIA' && role !== undefined) { /* gate by permission via API */ }
    const days = RANGES.find((r) => r.id === range).days;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    setData(null); setError('');
    api(`/reports/stats?from=${encodeURIComponent(from)}`).then(setData).catch((e) => setError(e.message));
  }, [range, role]);

  if (error) return <p className="text-red-600 text-center mt-10">{error === 'PERMISO_DENEGADO' ? 'No tienes permiso para ver estadísticas.' : error}</p>;
  if (!data) return <p className="text-zinc-500 text-center mt-10">Cargando estadísticas…</p>;

  const maxHora = Math.max(1, ...data.por_hora.map((h) => h.monto));
  const horasActivas = data.por_hora.filter((h) => h.monto > 0);
  const maxRank = Math.max(1, ...data.ranking.map((r) => r.unidades));

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">Estadísticas</h2>
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-lg font-bold text-sm ${range === r.id ? 'bg-cartel text-white' : 'text-zinc-600'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Ventas" value={money(data.total_ventas)} />
        <KPI label="N° de ventas" value={data.n_ventas} />
        <KPI label="Ticket promedio" value={money(data.ticket_promedio)} />
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

      <div className="grid md:grid-cols-2 gap-4">
        {/* Ranking */}
        <div className="bg-white rounded-2xl p-4 shadow">
          <h3 className="font-black mb-3">Más vendidos</h3>
          <ul className="space-y-2">
            {data.ranking.map((r) => (
              <li key={r.name}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold truncate pr-2">{r.name}</span>
                  <span className="text-zinc-500 whitespace-nowrap">{r.unidades} u · {money(r.monto)}</span>
                </div>
                <div className="h-2 bg-zinc-100 rounded-full mt-0.5"><div className="h-2 bg-cartel rounded-full" style={{ width: `${(r.unidades / maxRank) * 100}%` }} /></div>
              </li>
            ))}
            {!data.ranking.length && <li className="text-zinc-400">Sin datos.</li>}
          </ul>
        </div>

        {/* Por método */}
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
      </div>
    </div>
  );
}

function KPI({ label, value }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow text-center">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-black text-cartel">{value}</div>
    </div>
  );
}
