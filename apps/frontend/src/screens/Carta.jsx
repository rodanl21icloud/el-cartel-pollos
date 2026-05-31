import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// Gestión completa de la carta: crear/editar/eliminar productos + recetas (BOM).
// Las ediciones/eliminaciones son PUT/DELETE: si no eres gerencia, el backend
// pide OTP -> hay un campo OTP opcional que se envía con cada mutación.
export default function Carta({ role }) {
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [otp, setOtp] = useState('');
  const [creating, setCreating] = useState(false);
  const [recipeFor, setRecipeFor] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const needsOtp = role !== 'GERENCIA';

  async function load() {
    try {
      const [p, i] = await Promise.all([api('/products'), api('/inventory/ingredients')]);
      setProducts(p); setIngredients(i);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  function flash(m) { setToast(m); setTimeout(() => setToast(null), 2600); }
  const otpArg = needsOtp && otp ? otp : undefined;
  function handleErr(e) {
    setError(e.message === 'OTP_GERENCIA_REQUERIDO' ? 'Ingresa el OTP de gerencia arriba'
      : e.message === 'OTP_INVALIDO' ? 'OTP incorrecto' : e.message);
  }

  async function createProduct(body) {
    setError('');
    try { await api('/products', { method: 'POST', body, otp: otpArg }); setCreating(false); load(); flash('Producto creado'); }
    catch (e) { handleErr(e); }
  }
  async function saveProduct(id, body) {
    setError('');
    try { await api(`/products/${id}`, { method: 'PUT', body, otp: otpArg }); load(); flash('Producto actualizado'); }
    catch (e) { handleErr(e); }
  }
  async function removeProduct(id) {
    setError('');
    try { await api(`/products/${id}`, { method: 'DELETE', otp: otpArg }); load(); flash('Producto eliminado'); }
    catch (e) { handleErr(e); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
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

      <div className="bg-white rounded-2xl shadow divide-y">
        {products.map((p) => (
          <ProductRow key={p.id} product={p} onSave={saveProduct} onRemove={removeProduct}
            onRecipe={() => setRecipeFor(p)} />
        ))}
        {!products.length && <p className="p-4 text-zinc-400">Carta vacía. Crea tu primer plato.</p>}
      </div>

      {recipeFor && (
        <RecipeBuilder product={recipeFor} ingredients={ingredients} otp={otpArg} needsOtp={needsOtp}
          onClose={() => setRecipeFor(null)} onSaved={() => { setRecipeFor(null); flash('Receta guardada'); }} onError={handleErr} />
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>}
    </div>
  );
}

function NewProduct({ onSave }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('COMBO');
  return (
    <div className="bg-white rounded-2xl p-4 shadow space-y-2">
      <input placeholder="Nombre del plato" value={name} onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <input placeholder="Categoría" value={category} onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      </div>
      <button onClick={() => onSave({ name: name.trim(), price: Number(price || 0), category: category.trim() })}
        className="w-full btn-pos bg-cartel text-white">Crear plato</button>
    </div>
  );
}

function ProductRow({ product, onSave, onRemove, onRecipe }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2">
        {edit ? (
          <div className="flex gap-2 flex-1">
            <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none" />
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="w-28 px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none" />
          </div>
        ) : (
          <div>
            <div className="font-black">{product.name}</div>
            <div className="text-sm text-zinc-500">{product.sku} · {money(product.price)} · {product.category}</div>
          </div>
        )}
        <div className="flex gap-2">
          {edit ? (
            <>
              <button onClick={() => { onSave(product.id, { name: name.trim(), price: Number(price) }); setEdit(false); }}
                className="px-3 py-2 rounded-lg bg-cartel text-white font-bold">Guardar</button>
              <button onClick={() => setEdit(false)} className="px-3 py-2 rounded-lg bg-zinc-200 font-bold">×</button>
            </>
          ) : (
            <>
              <button onClick={onRecipe} className="px-3 py-2 rounded-lg bg-blue-600 text-white font-bold">Receta</button>
              <button onClick={() => setEdit(true)} className="px-3 py-2 rounded-lg bg-zinc-200 font-bold">Editar</button>
              <button onClick={() => onRemove(product.id)} className="px-3 py-2 rounded-lg bg-zinc-200 font-bold">Eliminar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RecipeBuilder({ product, ingredients, otp, onClose, onSaved, onError }) {
  const [lines, setLines] = useState({}); // ingredient_id -> qty (string)
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api(`/products/${product.id}/recipe`).then((r) => {
      const m = {};
      r.lines.forEach((l) => { m[l.ingredient_id] = String(l.qty_per_unit); });
      setLines(m); setLoaded(true);
    }).catch((e) => { onError(e); setLoaded(true); });
  }, [product.id]);

  const costo = ingredients.reduce((s, i) => s + (Number(lines[i.id]) || 0) * Number(i.cost_unit), 0);
  const margen = product.price - costo;

  async function save() {
    const payload = ingredients
      .filter((i) => Number(lines[i.id]) > 0)
      .map((i) => ({ ingredient_id: i.id, qty_per_unit: Number(lines[i.id]) }));
    try { await api(`/products/${product.id}/recipe`, { method: 'PUT', body: { lines: payload }, otp }); onSaved(); }
    catch (e) { onError(e); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-1">Receta · {product.name}</h3>
        <p className="text-sm text-zinc-500 mb-3">Cantidad de cada insumo por unidad vendida (acepta decimales).</p>
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
              <div className="flex justify-between"><span>Costo de insumos</span><b>{money(costo)}</b></div>
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
