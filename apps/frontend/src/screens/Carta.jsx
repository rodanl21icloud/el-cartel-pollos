import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { getCategoryAsset } from '../lib/categoryAssets.js';
import { CAT_ORDER } from '../components/carta/cartaShared.js';
import NewProduct from '../components/carta/NewProduct.jsx';
import EditModal from '../components/carta/EditModal.jsx';
import CatManager from '../components/carta/CatManager.jsx';
import ProductTable from '../components/carta/ProductTable.jsx';
import RecipeBuilder from '../components/carta/RecipeBuilder.jsx';
import RenameModal from '../components/carta/RenameModal.jsx';
import CatalogShareModal from '../components/carta/CatalogShareModal.jsx';
import PriceHistoryModal from '../components/carta/PriceHistoryModal.jsx';

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
  const [renameFor, setRenameFor] = useState(null);
  const [share, setShare] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);   const [loading, setLoading] = useState(false);
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
      : e.message === 'OTP_INVALIDO' ? 'OTP incorrecto'
      : e.message === 'NOMBRE_INVALIDO' ? 'El nombre debe ser descriptivo (no códigos como UPBEB125).'
      : e.message);
  }

  const cats = CAT_ORDER.filter((c) => items.some((p) => p.category === c));
  const otras = [...new Set(items.map((p) => p.category))].filter((c) => !CAT_ORDER.includes(c));
  const tabs = ['TODO', ...cats, ...otras];
  const q = search.trim().toLowerCase();
  const visible = items.filter((p) => (cat === 'TODO' || p.category === cat) && (!q || p.name.toLowerCase().includes(q)));

  const [showBulk, setShowBulk] = useState(false);
  const [bulk, setBulk] = useState({ cat: 'TODO', mode: 'pct', value: '' });
  const [histFor, setHistFor] = useState(null);

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
  const [editFor, setEditFor] = useState(null); // producto -> modal foto/categoría
  async function saveEdit(p, body) {
    setError('');
    try { await api(`/products/${p.id}`, { method: 'PUT', body, otp: otpArg }); setEditFor(null); load(); flash('Producto actualizado'); }
    catch (e) { handleErr(e); }
  }
  const [catMgr, setCatMgr] = useState(false);
  async function renameCat(from, to) {
    setError('');
    try { const r = await api('/products/categories/rename', { method: 'PUT', body: { from, to }, otp: otpArg }); load(); flash(`${r.moved} producto(s) movidos a ${r.to}`); }
    catch (e) { handleErr(e); }
  }
  async function toggleCatalog(p) {
    setError('');
    try {
      await api(`/products/${p.id}`, { method: 'PUT', body: { in_catalog: !p.in_catalog }, otp: otpArg });
      load(); flash(p.in_catalog ? 'Oculto del catálogo' : 'Visible en el catálogo');
    } catch (e) { handleErr(e); }
  }
  async function toggleAvailable(p) {
    setError('');
    try {
      await api(`/products/${p.id}`, { method: 'PUT', body: { available: p.available === false }, otp: otpArg });
      load(); flash(p.available === false ? 'Disponible para vender' : 'Marcado como agotado');
    } catch (e) { handleErr(e); }
  }
  async function applyBulk() {
    if (bulk.value === '' || isNaN(Number(bulk.value))) return setError('Ingresa un valor');
    setError('');
    try {
      const r = await api('/products/bulk-price', { method: 'PUT', body: { category: bulk.cat, mode: bulk.mode, value: Number(bulk.value) }, otp: otpArg });
      setBulk((b) => ({ ...b, value: '' })); setShowBulk(false); load(); flash(`${r.updated} precio(s) actualizado(s)`);
    } catch (e) { handleErr(e); }
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
          <button onClick={() => setCatMgr(true)} className="px-4 py-2 rounded-xl bg-white border-2 border-zinc-200 font-bold text-sm">📂 Categorías</button>
          <button onClick={() => setShare(true)} className="px-4 py-2 rounded-xl bg-ink text-white font-bold flex items-center gap-1.5">
            <span>🔗</span> Catálogo virtual
          </button>
          <button onClick={() => setCreating(!creating)} disabled={loading} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">
            {creating ? 'Cancelar' : '+ Nuevo plato'}
          </button>
        </div>
      </div>
      {error && <p className="text-red-600 font-semibold">{error}</p>}
      {creating && <NewProduct onSave={createProduct} existingCats={tabs.slice(1)} />}
      {editFor && <EditModal p={editFor} cats={tabs.slice(1)} onClose={() => setEditFor(null)} onSave={(body) => saveEdit(editFor, body)} />}
      {catMgr && <CatManager items={items} onClose={() => setCatMgr(false)} onRename={renameCat} />}

      {/* Cambio masivo de precios */}
      <div className="bg-white rounded-2xl shadow p-3">
        <button onClick={() => setShowBulk((s) => !s)} className="font-bold text-sm text-cartel">{showBulk ? '▾' : '▸'} Cambio masivo de precios</button>
        {showBulk && (
          <>
            <div className="mt-3 grid sm:grid-cols-4 gap-2 items-end">
              <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1">Categoría
                <select value={bulk.cat} onChange={(e) => setBulk({ ...bulk, cat: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-zinc-200 outline-none">
                  <option value="TODO">Todas</option>
                  {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1">Tipo
                <select value={bulk.mode} onChange={(e) => setBulk({ ...bulk, mode: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-zinc-200 outline-none">
                  <option value="pct">% porcentaje</option>
                  <option value="monto">+/- monto</option>
                  <option value="set">Fijar precio</option>
                </select>
              </label>
              <label className="text-xs font-bold text-zinc-500 flex flex-col gap-1">Valor
                <input type="number" value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })}
                  placeholder={bulk.mode === 'pct' ? 'Ej: 10 = +10%' : 'Ej: 500'} className="px-2 py-2 rounded-lg border-2 border-zinc-200 outline-none" />
              </label>
              <button onClick={applyBulk} className="px-3 py-2 rounded-xl bg-cartel text-white font-bold">Aplicar</button>
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">Afecta los productos activos de la categoría elegida. Queda en el historial de precios y en auditoría.</p>
          </>
        )}
      </div>

      {/* Filtros */}         {loading && <p className="text-xs text-zinc-400 animate-pulse px-1">Actualizando…</p>}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…"
        className="w-full px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const asset = t !== 'TODO' ? getCategoryAsset(t) : null;
          const isActive = cat === t;
          return (
            <button
              key={t}
              onClick={() => setCat(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold whitespace-nowrap text-sm transition-all ${
                isActive
                  ? (asset ? `bg-gradient-to-r ${asset.gradient} text-white shadow-md` : 'bg-cartel text-white')
                  : (asset ? `${asset.bgColor} ${asset.textColor} border border-transparent` : 'bg-white text-zinc-600 border border-zinc-200')
              }`}
            >
              {asset && <span>{asset.emoji}</span>}
              {t === 'TODO' ? 'Todo' : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          );
        })}
      </div>

      {/* Tabla */}
      <ProductTable visible={visible} q={q} cat={cat}
        onSavePrice={savePrice} onRecipe={setRecipeFor} onRename={setRenameFor}
        onToggleCatalog={toggleCatalog} onToggleAvailable={toggleAvailable}
        onHistory={setHistFor} onEdit={setEditFor} onRemove={removeProduct} />
      <p className="text-xs text-zinc-400 px-2">
        El <b>costo</b> se calcula con la receta (BOM). Los productos con receta <b>rebajan el inventario</b> al venderse.
        "Agregar receta" en gris = aún no descuenta insumos.
      </p>

      {recipeFor && (
        <RecipeBuilder product={recipeFor} ingredients={ingredients} otp={otpArg}
          onClose={() => setRecipeFor(null)} onSaved={() => { setRecipeFor(null); flash('Receta guardada'); load(); }} onError={handleErr} />
      )}
      {renameFor && (
        <RenameModal product={renameFor} otp={otpArg}
          onClose={() => setRenameFor(null)}
          onSaved={() => { setRenameFor(null); flash('Nombre actualizado'); load(); }} onError={handleErr} />
      )}
      {share && <CatalogShareModal otp={otpArg} count={items.filter((p) => p.in_catalog !== false).length}
        onClose={() => setShare(false)} onError={handleErr} flash={flash} />}
      {histFor && <PriceHistoryModal product={histFor} onClose={() => setHistFor(null)} />}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>}
    </div>
  );
}
