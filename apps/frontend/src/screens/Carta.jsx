import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api.js';
import { validarNombreProducto, esNombreInvalido } from '../lib/productName.js';
import { getCategoryAsset } from '../lib/categoryAssets.js';

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
          <button onClick={() => setShare(true)} className="px-4 py-2 rounded-xl bg-ink text-white font-bold flex items-center gap-1.5">
            <span>🔗</span> Catálogo virtual
          </button>
          <button onClick={() => setCreating(!creating)} disabled={loading} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">
            {creating ? 'Cancelar' : '+ Nuevo plato'}
          </button>
        </div>
      </div>
      {error && <p className="text-red-600 font-semibold">{error}</p>}
      {creating && <NewProduct onSave={createProduct} />}

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
                      ? <img src={p.image_url || getCategoryAsset(p.category)?.image || ''} alt="" className="w-10 h-10 rounded-lg object-cover bg-zinc-100" onError={(e) => { e.target.style.display = 'none'; }} />
                      : <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-300">🍗</div>}
                    <div>
                      <div className="font-bold flex items-center gap-1.5 flex-wrap">{p.name}
                        {/* KAN-28 (C): chip naranja si el nombre es inválido. Desaparece al renombrar (load() refresca). */}
                        {esNombreInvalido(p.name) && (
                          <button onClick={() => setRenameFor(p)}
                            title="Este producto aparece con código en la grilla de venta. Edita el nombre para que sea descriptivo."
                            className="text-[10px] font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 px-1.5 py-0.5 rounded-full">
                            ⚠️ Nombre inválido
                          </button>
                        )}
                        {p.in_catalog === false && <span className="text-[10px] font-bold bg-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded">oculto</span>}
                        {p.available === false && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">agotado</span>}
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
                  <button onClick={() => setRenameFor(p)} className="text-zinc-400 hover:text-cartel text-lg mr-1" title="Renombrar">✏️</button>
                  <button onClick={() => toggleCatalog(p)} className="text-lg mr-1" title={p.in_catalog === false ? 'Mostrar en catálogo' : 'Ocultar del catálogo'}>
                    {p.in_catalog === false ? '🙈' : '👁️'}
                  </button>
                  <button onClick={() => toggleAvailable(p)} className="text-lg mr-1" title={p.available === false ? 'Marcar disponible' : 'Marcar agotado'}>{p.available === false ? '🔴' : '🟢'}</button>
                  <button onClick={() => setHistFor(p)} className="text-zinc-400 hover:text-cartel text-lg mr-1" title="Historial de precio">📈</button>
                  <button onClick={() => setImage(p)} className="text-zinc-400 hover:text-cartel text-lg mr-1" title="Foto">📷</button>
                  <button onClick={() => removeProduct(p)} className="text-zinc-400 hover:text-red-600 text-lg" title="Eliminar">🗑</button>
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan="6" className="p-6 text-zinc-400 text-center text-sm">{q ? `Sin resultados para "${q}"` : cat !== 'TODO' ? `Sin productos en ${cat.charAt(0) + cat.slice(1).toLowerCase()}` : 'No hay productos aún.'}</td></tr>}
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

// Historial de cambios de precio de venta de un producto.
function PriceHistoryModal({ product, onClose }) {
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
  const [touched, setTouched] = useState(false);
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('POLLO');
  const [imageUrl, setImageUrl] = useState('');
  const nameErr = validarNombreProducto(name);          // '' si es válido

  function submit() {
    setTouched(true);
    if (nameErr) return;                                 // bloquea el submit si el nombre es inválido
    onSave({ name: name.trim(), price: Number(price || 0), category, image_url: imageUrl.trim() || undefined });
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow space-y-2">
      <input placeholder="Nombre del plato (descriptivo)" value={name}
        onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)}
        className={`w-full px-3 py-2 rounded-xl border-2 outline-none ${touched && nameErr ? 'border-red-400 focus:border-red-500' : 'border-zinc-200 focus:border-cartel'}`} />
      {touched && nameErr && <p className="text-red-600 text-xs font-semibold">{nameErr}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" placeholder="Precio" value={price} onChange={(e) => setPrice(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none">
          {[...CAT_ORDER, 'OTROS'].map((c) => <option key={c} value={c}>{getCategoryAsset(c)?.emoji} {c}</option>)}
        </select>
      </div>
      <input placeholder="URL de foto (opcional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <button onClick={submit} disabled={!!nameErr}
        className="w-full btn-pos bg-cartel text-white disabled:opacity-50 disabled:cursor-not-allowed">Crear plato</button>
    </div>
  );
}

// Edición del NOMBRE de un producto, con la misma validación bloqueante.
// Permite corregir nombres de código como ".UPBEB125".
function RenameModal({ product, otp, onClose, onSaved, onError }) {
  const [name, setName] = useState(product.name);
  const [touched, setTouched] = useState(true);          // muestra el error de entrada (el nombre actual puede ser inválido)
  const [busy, setBusy] = useState(false);
  const nameErr = validarNombreProducto(name);
  const sinCambios = name.trim() === product.name.trim();

  async function save() {
    setTouched(true);
    if (nameErr) return;
    setBusy(true);
    try {
      await api(`/products/${product.id}`, { method: 'PUT', body: { name: name.trim() }, otp });
      onSaved();
    } catch (e) { onError(e); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-1">Renombrar producto</h3>
        <p className="text-sm text-zinc-500 mb-3">{product.sku} · {product.category}</p>
        <label className="block text-xs font-bold text-zinc-500 mb-1">Nombre descriptivo</label>
        <input value={name} autoFocus onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)}
          className={`w-full px-3 py-2 rounded-xl border-2 outline-none ${touched && nameErr ? 'border-red-400 focus:border-red-500' : 'border-zinc-200 focus:border-cartel'}`} />
        {touched && nameErr && <p className="text-red-600 text-xs font-semibold mt-1">{nameErr}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={save} disabled={busy || !!nameErr || sinCambios}
            className="flex-1 btn-pos bg-cartel text-white disabled:opacity-50 disabled:cursor-not-allowed">{busy ? 'Guardando…' : 'Guardar nombre'}</button>
          <button onClick={onClose} className="px-4 rounded-2xl bg-zinc-200 font-bold">Cancelar</button>
        </div>
      </div>
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
