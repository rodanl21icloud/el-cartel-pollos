import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money, marginColor } from './cartaShared.js';

// Constructor de receta (BOM). Muestra costo y margen en vivo. Rebaja inventario al vender.
export default function RecipeBuilder({ product, ingredients, otp, onClose, onSaved, onError }) {
  const [lines, setLines] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api(`/products/${product.id}/recipe`).then((r) => {
      const m = {}; r.lines.forEach((l) => { m[l.ingredient_id] = String(l.qty_per_unit); });
      setLines(m); setLoaded(true);
    }).catch((e) => { onError(e); setLoaded(true); });
  }, [product.id]);

  const costo = ingredients.reduce((s, i) => s + (Number(lines[i.id]) || 0) * Number(i.cost_unit), 0);
  const margen = product.price - costo;
  const usados = ingredients.filter((i) => Number(lines[i.id]) > 0).length;

  async function save() {
    const payload = ingredients.filter((i) => Number(lines[i.id]) > 0)
      .map((i) => ({ ingredient_id: i.id, qty_per_unit: Number(lines[i.id]) }));
    try { await api(`/products/${product.id}/recipe`, { method: 'PUT', body: { lines: payload }, otp }); onSaved(); }
    catch (e) { onError(e); }
  }
  async function eliminar() {
    if (!confirm(`¿Eliminar la receta de "${product.name}"? Dejará de descontar inventario.`)) return;
    try { await api(`/products/${product.id}/recipe`, { method: 'PUT', body: { lines: [] }, otp }); onSaved(); }
    catch (e) { onError(e); }
  }
  const tieneReceta = Object.values(lines).some((v) => Number(v) > 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-1">Receta · {product.name}</h3>
        <p className="text-sm text-zinc-500 mb-3">Cantidad de cada insumo por unidad vendida (acepta decimales). Esto <b>rebaja el inventario</b> al vender.</p>
        {!loaded ? <p className="text-zinc-400">Cargando…</p> : (
          <>
            <div className="space-y-2">
              {ingredients.map((i) => (
                <div key={i.id} className="flex items-center gap-2">
                  <span className="flex-1 font-semibold">{i.name} <span className="text-xs text-zinc-400">({i.unit})</span></span>
                  <input type="number" min="0" step="any" placeholder="0" value={lines[i.id] || ''}
                    onChange={(e) => setLines({ ...lines, [i.id]: e.target.value })}
                    className="w-24 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-right" />
                </div>
              ))}
            </div>
            <div className="mt-4 bg-zinc-50 rounded-xl p-3 text-sm">
              <div className="flex justify-between"><span>Precio de venta</span><b>{money(product.price)}</b></div>
              <div className="flex justify-between"><span>Costo de insumos ({usados})</span><b>{money(costo)}</b></div>
              <div className="flex justify-between border-t mt-1 pt-1">
                <span>Margen</span>
                <b className={marginColor(margen)}>
                  {money(margen)} ({product.price > 0 ? Math.round((margen / product.price) * 100) : 0}%)
                </b>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={save} className="flex-1 btn-pos bg-cartel text-white">Guardar receta</button>
              {tieneReceta && <button onClick={eliminar} className="px-4 rounded-2xl bg-red-100 text-red-700 font-bold" title="Eliminar receta">🗑</button>}
              <button onClick={onClose} className="px-4 rounded-2xl bg-zinc-200 font-bold">Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
