import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: '2-digit' }); } catch { return ''; } };

// Lista de clientes (domicilios). Click en un cliente: historial de compras.
export default function Clientes() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const [hist, setHist] = useState(null);

  async function load(term = '') {
    try { setItems(await api(`/clients?q=${encodeURIComponent(term)}`)); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q]);

  async function toggle(c) {
    if (open === c.id) { setOpen(null); setHist(null); return; }
    setOpen(c.id); setHist(null);
    try { setHist(await api(`/clients/${c.id}/history`)); } catch { setHist({ error: true }); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <h2 className="font-black text-xl">Clientes</h2>
      {error && <p className="text-red-600 font-semibold">{error}</p>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o teléfono…"
        className="w-full px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="bg-white rounded-2xl shadow divide-y">
        {items.map((c) => (
          <div key={c.id}>
            <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50" onClick={() => toggle(c)}>
              <div className="min-w-0">
                <div className="font-bold">{c.name}</div>
                <div className="text-sm text-zinc-500 truncate">{c.phone || 'sin teléfono'}{c.address ? ` · ${c.address}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.phone && (
                  <a href={`https://wa.me/${String(c.phone).replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                    className="px-3 py-2 rounded-lg bg-green-600 text-white font-bold text-sm">WhatsApp</a>
                )}
                <span className="text-zinc-400">{open === c.id ? '▲' : '▼'}</span>
              </div>
            </div>
            {open === c.id && (
              <div className="px-4 pb-4 bg-slate-50">
                {!hist ? <p className="text-zinc-400 text-sm py-2">Cargando…</p>
                  : hist.error ? <p className="text-zinc-400 text-sm py-2">No se pudo cargar el historial.</p>
                    : (
                      <>
                        <div className="grid grid-cols-3 gap-2 py-2 text-center">
                          <div><div className="text-lg font-black">{hist.stats.n}</div><div className="text-[11px] text-zinc-500">compras</div></div>
                          <div><div className="text-lg font-black">{money(hist.stats.total)}</div><div className="text-[11px] text-zinc-500">total</div></div>
                          <div><div className="text-lg font-black">{money(hist.stats.ticket_prom)}</div><div className="text-[11px] text-zinc-500">ticket prom.</div></div>
                        </div>
                        {!hist.ventas.length ? <p className="text-zinc-400 text-sm">Sin compras registradas.</p> : (
                          <ul className="divide-y text-sm">
                            {hist.ventas.map((v, i) => (
                              <li key={i} className="py-1.5 flex justify-between gap-2">
                                <span className="min-w-0">#{v.order_number ?? '—'} <span className="text-zinc-400">{fecha(v.sold_at)}</span><span className="block text-xs text-zinc-500 truncate">{v.detalle}</span></span>
                                <span className="font-bold whitespace-nowrap">{money(v.total)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
              </div>
            )}
          </div>
        ))}
        {!items.length && <p className="p-4 text-zinc-400">Aún no hay clientes. Se crean al vender a domicilio.</p>}
      </div>
    </div>
  );
}
