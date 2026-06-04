import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, ErrorState, EmptyState } from '../components/ui/States.jsx';

// Monitor de variación de precio de compra por insumo (cuándo conviene comprar).
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }); } catch { return iso; } };
const BADGE = {
  barato: { txt: '✓ Más barato', cls: 'bg-green-100 text-green-700 border-green-300' },
  caro: { txt: '▲ Más caro', cls: 'bg-red-100 text-red-700 border-red-300' },
  medio: { txt: 'En rango', cls: 'bg-zinc-100 text-zinc-600 border-zinc-300' },
};
const RANGOS = [{ id: 90, label: '90 días' }, { id: 180, label: '6 meses' }, { id: 365, label: '1 año' }];

export default function PreciosInsumos() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [dias, setDias] = useState(365);

  async function load(d = dias) {
    setError(null); setData(null);
    const from = new Date(Date.now() - d * 86400000).toISOString();
    try { setData(await api(`/reports/precios-insumos?from=${encodeURIComponent(from)}`)); } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, [dias]);

  if (error) return <ErrorState error={error} onRetry={() => load()} />;
  if (!data) return <Spinner label="Cargando precios de compra…" />;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-black">Precios de compra 📈</h2>
          <p className="text-zinc-500 text-sm">Variación del costo por insumo según tus reposiciones.</p>
        </div>
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
          {RANGOS.map((r) => <button key={r.id} onClick={() => setDias(r.id)} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${dias === r.id ? 'bg-cartel text-white' : 'text-zinc-500'}`}>{r.label}</button>)}
        </div>
      </div>

      {!data.insumos.length ? (
        <EmptyState icon="📦" title="Sin compras registradas" hint="Repón stock con su costo en Inventario para empezar a monitorear precios." />
      ) : data.insumos.map((it) => {
        const b = BADGE[it.estado] || BADGE.medio;
        const pollo = /ollo/i.test(it.name);
        const maxC = Math.max(...it.compras.map((c) => c.cost_unit));
        return (
          <div key={it.name} className={`bg-white rounded-2xl shadow p-4 ${pollo ? 'ring-2 ring-amber-300' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-black text-lg">{pollo ? '🍗 ' : ''}{it.name} <span className="text-zinc-400 text-sm font-normal">/ {it.unit}</span></div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${b.cls}`}>{b.txt}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-sm mb-3">
              <Stat label="Último" v={money(it.ultimo)} strong />
              <Stat label="Mínimo" v={money(it.min)} cls="text-green-600" />
              <Stat label="Máximo" v={money(it.max)} cls="text-red-600" />
              <Stat label="Prom. pond." v={money(it.promedio_ponderado)} />
            </div>
            {it.variacion_pct != null && (
              <div className={`text-sm font-bold mb-2 ${it.variacion_pct > 0 ? 'text-red-600' : it.variacion_pct < 0 ? 'text-green-600' : 'text-zinc-500'}`}>
                {it.variacion_pct > 0 ? '▲' : it.variacion_pct < 0 ? '▼' : '='} {Math.abs(it.variacion_pct)}% vs compra anterior
              </div>
            )}
            {/* Mini-historial (sparkline de barras por compra) */}
            <div className="flex items-end gap-1 h-16">
              {it.compras.map((c, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end group" title={`${fecha(c.fecha)} · ${money(c.cost_unit)} (${c.qty})`}>
                  <div className={`w-full rounded-t ${c.cost_unit === it.min ? 'bg-green-500' : c.cost_unit === it.max ? 'bg-red-500' : 'bg-cartel/70'}`}
                    style={{ height: `${Math.max(8, (c.cost_unit / maxC) * 100)}%` }} />
                  <span className="text-[9px] text-zinc-400 mt-0.5">{fecha(c.fecha)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, v, cls = '', strong }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className={`tabular-nums ${strong ? 'font-black' : 'font-bold'} ${cls}`}>{v}</div>
    </div>
  );
}
