import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// Flujo de estados y el siguiente paso de cada uno.
const FLOW = {
  PENDIENTE:      { label: 'Pendiente',      color: 'bg-zinc-200 text-zinc-700', next: 'EN_PREPARACION', nextLabel: 'Preparar' },
  EN_PREPARACION: { label: 'En preparación', color: 'bg-amber-100 text-amber-700', next: 'LISTO', nextLabel: 'Marcar listo' },
  LISTO:          { label: 'Listo',          color: 'bg-green-100 text-green-700', next: 'ENTREGADO', nextLabel: 'Entregar' },
  ENTREGADO:      { label: 'Entregado',      color: 'bg-zinc-100 text-zinc-400', next: null, nextLabel: null },
};

export default function Despacho() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api('/dispatch')); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000); // refresco automático del tablero
    return () => clearInterval(t);
  }, [load]);

  async function advance(o) {
    const next = FLOW[o.status].next;
    if (!next) return;
    try { await api(`/dispatch/${o.sale_id}/status`, { method: 'PUT', body: { status: next } }); load(); }
    catch (e) { setError(e.message); }
  }

  if (error && !data) return <p className="text-red-600 text-center mt-10">{error}</p>;
  if (!data) return <p className="text-zinc-500 text-center mt-10">Cargando despacho…</p>;

  // Activos arriba (no entregados), entregados al final.
  const activos = data.orders.filter((o) => o.status !== 'ENTREGADO');
  const entregados = data.orders.filter((o) => o.status === 'ENTREGADO');

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">Despacho · {data.day}</h2>
        <div className="flex gap-2 text-xs">
          {Object.entries(FLOW).map(([k, v]) => (
            <span key={k} className={`px-2 py-1 rounded-full font-bold ${v.color}`}>{v.label}: {data.counts[k] || 0}</span>
          ))}
        </div>
      </div>
      {error && <p className="text-red-600 font-semibold">{error}</p>}

      <div className="space-y-2">
        {activos.map((o) => {
          const f = FLOW[o.status];
          return (
            <div key={o.sale_id} className="bg-white rounded-2xl p-4 shadow flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-3xl font-black text-cartel tabular-nums">#{o.order_number}</div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{o.detalle || '—'}</div>
                  <div className="text-xs text-zinc-500">{money(o.total)} · {o.payment_method}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${f.color}`}>{f.label}</span>
                {f.next && (
                  <button onClick={() => advance(o)} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">{f.nextLabel}</button>
                )}
              </div>
            </div>
          );
        })}
        {!activos.length && <p className="text-zinc-400 text-center py-6">No hay pedidos activos.</p>}
      </div>

      {entregados.length > 0 && (
        <details className="bg-white rounded-2xl p-4 shadow">
          <summary className="font-bold cursor-pointer text-zinc-500">Entregados ({entregados.length})</summary>
          <ul className="mt-2 text-sm text-zinc-500 space-y-1">
            {entregados.map((o) => (
              <li key={o.sale_id} className="flex justify-between"><span>#{o.order_number} · {o.detalle}</span><span>{money(o.total)}</span></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
