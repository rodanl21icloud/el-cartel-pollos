import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
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
  const [share, setShare] = useState(false);
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
  async function setImage(p) {
    const url = window.prompt('Pega la URL de la foto del producto:', p.image_url || '');
    if (url === null) return;
    setError('');
    try { await api(`/products/${p.id}`, { method: 'PUT', body: { image_url: url.trim() }, otp: otpArg }); load(); flash('Foto actualizada'); }
    catch (e) { handleErr(e); }
  }
  async function toggleCatalog(p) {
    setError('');
    try {
      await api(`/products/${p.id}`, { method: 'PUT', body: { in_catalog: !p.in_catalog }, otp: otpArg });
      load(); flash(p.in_catalog ? 'Oculto del catálogo' : 'Visible en el catálogo');
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
          <button onClick={() => setShare(true)} className="px-4 py-2 rounded-xl bg-ink text-white font-bold flex items-center gap-1.5">
            <span>🔗</span> Catálogo virtual
          </button>
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
              <tr key={p.id} className={`border-b last:border-0 hover:bg-zinc-50 ${p.in_catalog === false ? 'opacity-50' : ''}`}>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-zinc-100" onError={(e) => { e.target.style.display = 'none'; }} />
                      : <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-300">🍗</div>}
                    <div>
                      <div className="font-bold flex items-center gap-1.5">{p.name}
                        {p.in_catalog === false && <span className="text-[10px] font-bold bg-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded">oculto</span>}
                      </div>
                      <div className="text-xs text-zinc-400">{p.sku} · {p.category}</div>
                    </div>
                  </div>
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
                  <button onClick={() => toggleCatalog(p)} className="text-lg mr-1" title={p.in_catalog === false ? 'Mostrar en catálogo' : 'Ocultar del catálogo'}>
                    {p.in_catalog === false ? '🙈' : '👁️'}
                  </button>
                  <button onClick={() => setImage(p)} className="text-zinc-400 hover:text-cartel text-lg mr-1" title="Foto">📷</button>
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
      {share && <CatalogShareModal otp={otpArg} count={items.filter((p) => p.in_catalog !== false).length}
        onClose={() => setShare(false)} onError={handleErr} flash={flash} />}
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

// Catálogo virtual: link compartible + QR + formas de entrega (estilo Treinta).
function CatalogShareModal({ otp, count, onClose, onError, flash }) {
  const [s, setS] = useState(null);
  const [slug, setSlug] = useState('');
  const [whats, setWhats] = useState('');
  const [qr, setQr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/settings').then((d) => {
      setS(d); setSlug(d.catalog_slug || ''); setWhats(d.whatsapp || '');
      // Si no hay slug, generamos uno y lo persistimos.
      if (!d.catalog_slug) {
        const base = (d.instagram || d.name || 'mi-negocio').toLowerCase()
          .replace(/^@/, '').replace(/\.cl$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
        save({ catalog_slug: base });
      }
    }).catch(onError);
  }, []);

  const url = slug ? `${window.location.origin}/catalogo/${slug}` : '';
  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 260, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(''));
  }, [url]);

  async function save(patch) {
    setSaving(true);
    try {
      const d = await api('/settings', { method: 'PUT', body: patch, otp });
      setS(d); if (d.catalog_slug != null) setSlug(d.catalog_slug);
    } catch (e) { onError(e); } finally { setSaving(false); }
  }
  const toggle = (key) => save({ [key]: s[key] ? 0 : 1 });
  function copy() { navigator.clipboard?.writeText(url).then(() => flash('Link copiado')); }
  function download() {
    if (!qr) return;
    const a = document.createElement('a'); a.href = qr; a.download = `catalogo-${slug || 'cartel'}.png`; a.click();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-black text-lg">Catálogo virtual</h3>
          <button onClick={onClose} className="text-zinc-400 text-xl">✕</button>
        </div>
        <p className="text-sm text-zinc-500 mb-4">Comparte este link con tus clientes. Verán {count} producto{count === 1 ? '' : 's'} publicado{count === 1 ? '' : 's'}. Para ocultar uno, usa el ícono 👁️ en la tabla.</p>

        {!s ? <p className="text-zinc-400">Cargando…</p> : (
          <>
            {/* QR */}
            <div className="flex justify-center mb-3">
              {qr ? <img src={qr} alt="QR del catálogo" className="w-44 h-44 rounded-xl border border-zinc-100" /> : <div className="w-44 h-44 rounded-xl bg-zinc-100 animate-pulse" />}
            </div>

            {/* Link + slug */}
            <label className="text-xs font-bold text-zinc-500">Tu link</label>
            <div className="flex items-center gap-1 mt-1 mb-1 bg-zinc-50 border-2 border-zinc-200 rounded-xl px-3 py-2">
              <span className="text-sm text-zinc-400 truncate">{window.location.host}/catalogo/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => slug && slug !== s.catalog_slug && save({ catalog_slug: slug })}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm font-bold text-ink" />
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={copy} className="flex-1 py-2 rounded-xl bg-cartel text-white font-bold text-sm">Copiar link</button>
              <button onClick={download} className="px-4 py-2 rounded-xl bg-zinc-200 font-bold text-sm">Descargar QR</button>
              <a href={url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-zinc-200 font-bold text-sm grid place-items-center">Ver</a>
            </div>

            {/* Formas de entrega */}
            <div className="border-t pt-3">
              <div className="text-xs font-bold text-zinc-500 mb-2">Formas de entrega</div>
              <Toggle label="🏠 Retiro en tienda" on={!!s.pickup_enabled} onClick={() => toggle('pickup_enabled')} disabled={saving} />
              <Toggle label="🛵 Entrega a domicilio" on={!!s.delivery_enabled} onClick={() => toggle('delivery_enabled')} disabled={saving} />
            </div>

            {/* WhatsApp para recibir pedidos */}
            <div className="border-t pt-3 mt-3">
              <label className="text-xs font-bold text-zinc-500">WhatsApp para pedidos (con código país)</label>
              <input value={whats} onChange={(e) => setWhats(e.target.value)} onBlur={() => whats !== (s.whatsapp || '') && save({ whatsapp: whats })}
                placeholder="+569 1234 5678" inputMode="tel"
                className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-sm" />
              <p className="text-xs text-zinc-400 mt-1">Los pedidos del catálogo llegan a este número por WhatsApp.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, on, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full flex items-center justify-between py-2">
      <span className="font-semibold text-zinc-700">{label}</span>
      <span className={`w-11 h-6 rounded-full transition relative ${on ? 'bg-green-500' : 'bg-zinc-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function NewProduct({ onSave }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('POLLO');
  const [imageUrl, setImageUrl] = useState('');
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
      <input placeholder="URL de foto (opcional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <button onClick={() => onSave({ name: name.trim(), price: Number(price || 0), category, image_url: imageUrl.trim() || undefined })}
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
                <b className={margen >= 0 ? 'text-green-600' : 'text-red-600'}>
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
