import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const CAT_ORDER = ['POLLO', 'COMBOS', 'COLACIONES', 'PAPAS', 'SNACKS', 'BEBIDAS'];
const marginColor = (m) => (m >= 50 ? 'text-green-600' : m >= 30 ? 'text-amber-600' : 'text-red-600');

// Carta tipo Treinta: tabla con precio, costo (por receta), ganancia/margen,
// receta (rebaja inventario) y acciones. Filtro por categoría + buscador.
export default function Carta({ role }) {
  const [items, setItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [cat, setCat] = useState('TODO');
  const [search, setSearch] = useState('');
  const [otp, setOtp] = useState('');
  const [creating, setCreating] = useState(false);
  const [recipeFor, setRecipeFor] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const needsOtp = role !== 'GERENCIA';
  const otpArg = needsOtp && otp ? otp : undefined;

  async function load() {
    try {
      const [c, i] = await Promise.all([api('/products/catalog'), api('/inventory/ingredients')]);
      setItems(c); setIngredients(i);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2600); }
  function handleErr(e) {
    setError(e.message === 'OTP_GERENCIA_REQUERIDO' ? 'Ingresa el OTP de gerencia arriba'
      : e.message === 'OTP_INVALIDO' ? 'OTP incorrecto' : e.message);
  }

  const cats = CAT_ORDER.filter((c) => items.some((p) => p.category === c));
  const otras = [...new Set(items.map((p) => p.category))].filter((c) => !CAT_ORDER.includes(c));
  const tabs = ['TODO', ...cats, ...otras];
  const q = search.trim().toLowerCase();
  const visible = items.filter((p) => (cat === 'TODO' || p.category === cat) && (!q || p.name.toLowerCase().includes(q)));

  async function savePrice(p, price) {
    if (Number(price) === p.price) return;
    setError('');
    try { await api(`/products/${p.id}`, { method: 'PUT', body: { price: Number(price) }, otp: otpArg }); flash('Precio actualizado'); load(); }
    catch (e) { handleErr(e); load(); }
  }
  async function createProduct(body) {
    setError('');
    try { await api('/products', { method: 'POST', body, otp: otpArg }); setCreating(false); load(); flash('Producto creado'); }
    catch (e) { handleErr(e); }
  }
  async function removeProduct(p) {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    setError('');
    try { await api(`/products/${p.id}`, { method: 'DELETE', otp: otpArg }); load(); flash('Producto eliminado'); }
    catch (e) { handleErr(e); }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-black text-xl">Carta</h2>
        <div className="flex items-center gap-2">
          {needsOtp && (
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP gerencia" inputMode="numeric"
              className="w-32 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-sm" />
          )}
          <button onClick={() => setCreating(!creating)} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">
            {creating ? 'Cancelar' : '+ Nuevo plato'}
          </button>
        </div>
      </div>
      {error && <p className="text-red-600 font-semibold">{error}</p>}
      {creating && <NewProduct onSave={createProduct} />}

      {/* Filtros */}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…"
        className="w-full px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t} onClick={() => setCat(t)}
            className={`px-4 py-1.5 rounded-full font-bold whitespace-nowrap text-sm ${cat === t ? 'bg-cartel text-white' : 'bg-white text-zinc-600 border border-zinc-200'}`}>
            {t === 'TODO' ? 'Todo' : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-zinc-500 border-b">
              <th className="p-3">Producto</th>
              <th className="p-3 text-right">Precio</th>
              <th className="p-3 text-right">Costo</th>
              <th className="p-3 text-right">Ganancia</th>
              <th className="p-3 text-center">Receta</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-zinc-50">
                <td className="p-3">
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-zinc-400">{p.sku} · {p.category}</div>
                </td>
                <td className="p-3 text-right">
                  <PriceCell value={p.price} onSave={(v) => savePrice(p, v)} />
                </td>
                <td className="p-3 text-right tabular-nums text-zinc-600">{money(p.costo)}</td>
                <td className="p-3 text-right tabular-nums">
                  <div className="font-bold">{money(p.ganancia)}</div>
                  <div className={`text-xs font-bold ${marginColor(p.margen)}`}>{p.margen}%</div>
                </td>
                <td className="p-3 text-center">
                  <button onClick={() => setRecipeFor(p)}
                    className={`text-sm font-bold ${p.has_recipe ? 'text-blue-600' : 'text-zinc-400'}`}>
                    {p.has_recipe ? 'Ver receta ›' : 'Agregar receta'}
                  </button>
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => removeProduct(p)} className="text-zinc-400 hover:text-red-600 text-lg" title="Eliminar">🗑</button>
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan="6" className="p-4 text-zinc-400 text-center">Sin productos.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400 px-2">
        El <b>costo</b> se calcula con la receta (BOM). Los productos con receta <b>rebajan el inventario</b> al venderse.
        "Agregar receta" en gris = aún no descuenta insumos.
      </p>

      {recipeFor && (
        <RecipeBuilder product={recipeFor} ingredients={ingredients} otp={otpArg}
          onClose={() => setRecipeFor(null)} onSaved={() => { setRecipeFor(null); flash('Receta guardada'); load(); }} onError={handleErr} />
      )}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>}
    </div>
  );
}

// Precio editable inline (guarda al perder foco / Enter si cambió).
function PriceCell({ value, onSave }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <input type="number" min="0" value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      className="w-24 px-2 py-1 rounded-lg border-2 border-zinc-200 focus:border-cartel outline-none text-right tabular-nums" />
  );
}

function NewProduct({ onSave }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('POLLO');
  return (
    <div className="bg-white rounded-2xl p-4 shadow space-y-2">
      <input placeholder="Nombre del plato" value={name} onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none">
          {[...CAT_ORDER, 'OTROS'].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <button onClick={() => onSave({ name: name.trim(), price: Number(price || 0), category })}
        className="w-full btn-pos bg-cartel text-white">Crear plato</button>
    </div>
  );
}

// Constructor de receta (BOM). Muestra costo y margen en vivo. Rebaja inventario al vender.
function RecipeBuilder({ product, ingredients, otp, onClose, onSaved, onError }) {
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
                <b className={margen >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {money(margen)} ({product.price > 0 ? Math.round((margen / product.price) * 100) : 0}%)
                </b>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={save} className="flex-1 btn-pos bg-cartel text-white">Guardar receta</button>
              <button onClick={onClose} className="px-4 rounded-2xl bg-zinc-200 font-bold">Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
