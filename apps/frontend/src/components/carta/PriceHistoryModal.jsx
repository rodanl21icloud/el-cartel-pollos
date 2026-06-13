import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from './cartaShared.js';

// Historial de cambios de precio de venta de un producto.
export default function PriceHistoryModal({ product, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api(`/products/${product.id}/price-history`).then(setRows).catch(() => setRows([])); }, [product.id]);
  const f = (iso) => { try { return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleDateString('es-CL'); } catch { return ''; } };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-1">Historial de precio</h3>
        <p className="text-sm text-zinc-500 mb-3">{product.name}</p>
        {!rows ? <p className="text-zinc-400 text-sm">Cargando…</p>
          : !rows.length ? <p className="text-zinc-400 text-sm">Sin cambios de precio registrados.</p>
            : (
              <ul className="divide-y text-sm max-h-80 overflow-auto">
                {rows.map((r, i) => (
                  <li key={i} className="py-2 flex justify-between gap-2">
                    <span className="min-w-0">{money(r.old_price ?? 0)} → <b>{money(r.new_price)}</b><span className="block text-xs text-zinc-400">{r.reason} · {r.usuario}</span></span>
                    <span className="text-xs text-zinc-400 whitespace-nowrap">{f(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
        <button onClick={onClose} className="w-full mt-4 py-2.5 rounded-xl bg-zinc-100 font-bold">Cerrar</button>
      </div>
    </div>
  );
}
