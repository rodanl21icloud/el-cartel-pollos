import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Lista de clientes (domicilios). Se crean automáticamente al vender a domicilio.
export default function Clientes() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  async function load(term = '') {
    try { setItems(await api(`/clients?q=${encodeURIComponent(term)}`)); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(() => load(q), 300); return () => clearTimeout(t); }, [q]);

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <h2 className="font-black text-xl">Clientes</h2>
      {error && <p className="text-red-600 font-semibold">{error}</p>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o teléfono…"
        className="w-full px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="bg-white rounded-2xl shadow divide-y">
        {items.map((c) => (
          <div key={c.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="font-bold">{c.name}</div>
              <div className="text-sm text-zinc-500">{c.phone || 'sin teléfono'}{c.address ? ` · ${c.address}` : ''}</div>
            </div>
            {c.phone && (
              <a href={`https://wa.me/${String(c.phone).replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer"
                className="px-3 py-2 rounded-lg bg-green-600 text-white font-bold text-sm">WhatsApp</a>
            )}
          </div>
        ))}
        {!items.length && <p className="p-4 text-zinc-400">Aún no hay clientes. Se crean al vender a domicilio.</p>}
      </div>
    </div>
  );
}
