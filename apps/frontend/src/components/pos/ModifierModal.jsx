import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from './posShared.js';

// Modal de selección de adiciones/modificadores al agregar un producto.
export default function ModifierModal({ product, onCancel, onConfirm }) {
  const [groups, setGroups] = useState(null);
  const [sel, setSel] = useState({}); // group_id -> Set(option_id)
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/products/${product.id}/modifiers`).then((g) => { setGroups(g); }).catch((e) => setError(e.message));
  }, [product.id]);

  function toggle(group, optId) {
    setSel((s) => {
      const cur = new Set(s[group.id] || []);
      const single = (group.max_select === 1);
      if (cur.has(optId)) cur.delete(optId);
      else {
        if (single) cur.clear();
        else if (group.max_select && cur.size >= group.max_select) return s; // tope
        cur.add(optId);
      }
      return { ...s, [group.id]: cur };
    });
  }

  function confirm() {
    // Validar requeridos / mínimos.
    for (const g of groups) {
      const n = (sel[g.id] || new Set()).size;
      if (g.is_required && n < Math.max(1, g.min_select)) { setError(`Elige en "${g.name}"`); return; }
      if (g.min_select && n < g.min_select) { setError(`Elige al menos ${g.min_select} en "${g.name}"`); return; }
    }
    const chosen = [];
    for (const g of groups) for (const oid of (sel[g.id] || [])) {
      const o = g.options.find((x) => x.id === oid);
      if (o) chosen.push({ id: o.id, name: o.name, price_delta: o.price_delta });
    }
    onConfirm(chosen);
  }

  const extra = groups ? groups.flatMap((g) => [...(sel[g.id] || [])].map((oid) => g.options.find((o) => o.id === oid)?.price_delta || 0)).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-30" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-1">{product.name}</h3>
        <p className="text-sm text-zinc-500 mb-3">{money(product.price)}{extra > 0 ? ` + ${money(extra)}` : ''}</p>
        {!groups ? <p className="text-zinc-400">Cargando opciones…</p> : groups.map((g) => (
          <div key={g.id} className="mb-4">
            <div className="font-bold mb-1">{g.name} {g.is_required && <span className="text-red-500 text-xs">*obligatorio</span>}
              <span className="text-xs text-zinc-400 font-normal"> ({g.max_select === 1 ? 'elige 1' : `máx ${g.max_select || '∞'}`})</span></div>
            <div className="grid grid-cols-2 gap-2">
              {g.options.map((o) => {
                const on = (sel[g.id] || new Set()).has(o.id);
                return (
                  <button key={o.id} onClick={() => toggle(g, o.id)}
                    className={`rounded-xl py-2 px-3 text-sm font-bold border-2 text-left ${on ? 'border-cartel bg-cartel/10' : 'border-zinc-200'}`}>
                    {o.name}{o.price_delta > 0 && <span className="block text-xs text-cartel">+{money(o.price_delta)}</span>}
                  </button>
                );
              })}
              {!g.options.length && <span className="text-zinc-400 text-sm">Sin opciones.</span>}
            </div>
          </div>
        ))}
        {error && <p className="text-red-600 font-semibold mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={confirm} className="flex-1 btn-pos bg-cartel text-white">Agregar {extra > 0 ? `(${money(product.price + extra)})` : ''}</button>
          <button onClick={onCancel} className="px-4 rounded-2xl bg-zinc-200 font-bold">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
