import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, EmptyState, ErrorState } from '../components/ui/States.jsx';

// Kitchen Display System (KDS): tablero de cocina por estado, polling cada 7s.
const NEXT = { PENDIENTE: 'EN_PREPARACION', EN_PREPARACION: 'LISTO', LISTO: 'ENTREGADO' };
const PREV = { EN_PREPARACION: 'PENDIENTE', LISTO: 'EN_PREPARACION' };
const COLS = [['PENDIENTE', 'Pendientes', '🟡'], ['EN_PREPARACION', 'En preparación', '🔥'], ['LISTO', 'Listos', '✅']];

const hora = (iso) => { try { return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const mods = (m) => { try { const a = JSON.parse(m); return Array.isArray(a) ? a.map((x) => x.name || x).filter(Boolean) : []; } catch { return []; } };

export default function Kds() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const seen = useRef(new Set());
  const [fresh, setFresh] = useState({}); // sale_id -> timestamp (pedido nuevo)

  const load = useCallback(() => {
    api('/dispatch')
      .then((d) => {
        setData(d); setError(null);
        const ids = (d.orders || []).filter((o) => o.status !== 'ENTREGADO').map((o) => o.sale_id);
        if (seen.current.size) {
          const nuevos = ids.filter((id) => !seen.current.has(id));
          if (nuevos.length) setFresh((f) => { const n = { ...f }; nuevos.forEach((id) => (n[id] = Date.now())); return n; });
        }
        ids.forEach((id) => seen.current.add(id));
      })
      .catch((e) => setError(e));
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 7000); return () => clearInterval(id); }, [load]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(id); }, []);
  useEffect(() => { // limpia el resaltado de "nuevo" tras ~6s
    const cut = now - 6000;
    if (Object.values(fresh).some((t) => t <= cut)) setFresh((f) => Object.fromEntries(Object.entries(f).filter(([, t]) => t > cut)));
  }, [now]); // eslint-disable-line

  async function mover(saleId, status) {
    setData((d) => ({ ...d, orders: d.orders.map((o) => (o.sale_id === saleId ? { ...o, status } : o)) })); // optimista
    try { await api(`/dispatch/${saleId}/status`, { method: 'PUT', body: { status } }); } catch { load(); }
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner label="Cargando cocina…" />;
  const activos = data.orders.filter((o) => o.status !== 'ENTREGADO');

  return (
    <div className="bg-zinc-900 text-white rounded-2xl p-4 min-h-[80vh]">
      <style>{`@keyframes kdsNew{0%,100%{box-shadow:0 0 0 0 rgba(245,166,35,0)}50%{box-shadow:0 0 0 7px rgba(245,166,35,.6)}}.kds-new{animation:kdsNew 1.4s ease-in-out 3}`}</style>

      <header className="flex items-center justify-between mb-4 px-1">
        <h1 className="text-3xl font-black">👨‍🍳 Cocina <span className="text-amber-400">KDS</span></h1>
        <div className="flex items-center gap-4 text-white/70 font-bold">
          <span>{data.day}</span>
          <span className="px-3 py-1 rounded-full bg-amber-400 text-zinc-900">{activos.length} pedidos</span>
          <button onClick={load} className="px-3 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600">↻</button>
        </div>
      </header>

      {!activos.length ? (
        <EmptyState icon="🍗" title="Sin pedidos en cocina" hint="Las nuevas órdenes aparecen aquí automáticamente." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLS.map(([key, label, ic]) => {
            const list = activos.filter((o) => o.status === key);
            return (
              <div key={key} className="min-w-0">
                <h2 className="font-black text-xl mb-3 flex items-center gap-2 sticky top-0">
                  <span>{ic}</span> {label} <span className="ml-auto text-white/50">{list.length}</span>
                </h2>
                <div className="space-y-4">
                  {list.map((o) => <Tarjeta key={o.sale_id} o={o} now={now} fresh={!!fresh[o.sale_id]} onMove={mover} />)}
                  {!list.length && <p className="text-white/30 text-center py-8">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Tarjeta({ o, now, fresh, onMove }) {
  const mins = Math.max(0, Math.floor((now - new Date(o.sold_at).getTime()) / 60000));
  const border = mins >= 10 ? 'border-red-500' : mins >= 5 ? 'border-amber-400' : 'border-green-500';
  const chip = mins >= 10 ? 'bg-red-500 animate-pulse' : mins >= 5 ? 'bg-amber-400 text-zinc-900' : 'bg-green-600';
  const dom = !!o.delivery_address;
  return (
    <div className={`rounded-2xl bg-zinc-800 border-2 ${border} p-4 ${fresh ? 'kds-new' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="font-black leading-none" style={{ fontSize: 52 }}>#{o.order_number}</span>
        <span className={`px-3 py-1 rounded-full font-black text-xl ${chip}`}>{mins}′</span>
      </div>
      <div className="text-white/70 font-bold mt-1">{dom ? '🛵 Domicilio' : '🏠 Retiro'} · {hora(o.sold_at)}</div>

      <ul className="mt-3 space-y-2">
        {(o.items?.length ? o.items : []).map((it, i) => (
          <li key={i}>
            <div className="flex items-baseline gap-2">
              <span className="font-black text-amber-400" style={{ fontSize: 26 }}>{it.qty}×</span>
              <span className="font-bold text-2xl leading-tight">{it.name}</span>
            </div>
            {mods(it.modifiers).map((m, j) => <span key={j} className="ml-9 mr-2 text-cyan-300 text-base">+ {m}</span>)}
          </li>
        ))}
        {!o.items?.length && o.detalle && <li className="text-xl">{o.detalle}</li>}
      </ul>

      {o.note && <div className="mt-3 bg-yellow-500/15 text-yellow-200 rounded-lg px-3 py-1.5 font-semibold">📝 {o.note}</div>}

      <div className="flex gap-2 mt-4">
        {PREV[o.status] && (
          <button onClick={() => onMove(o.sale_id, PREV[o.status])} className="px-4 py-3 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-2xl font-black" title="Retroceder">◀</button>
        )}
        <button onClick={() => onMove(o.sale_id, NEXT[o.status])} className="flex-1 py-3 rounded-xl bg-cartel hover:bg-cartel-dark text-white font-black text-2xl">
          {o.status === 'LISTO' ? 'ENTREGAR ✓' : 'AVANZAR ▶'}
        </button>
      </div>
    </div>
  );
}
