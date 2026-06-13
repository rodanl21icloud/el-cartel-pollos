import { useState } from 'react';

// Comprime una imagen local a JPEG ~480px y la devuelve como data URL (cabe en image_url).
async function fileToDataUrl(file) {
  const img = await createImageBitmap(file);
  const max = 480, sc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.78);
}

// Editar foto, categoría, costo, SKU, impuesto e inventario de un producto.
export default function EditModal({ p, cats, onClose, onSave }) {
  const [url, setUrl] = useState(p.image_url || '');
  const [category, setCategory] = useState(p.category);
  const [cost, setCost] = useState(p.cost != null ? String(p.cost) : '');
  const [sku, setSku] = useState(p.sku || '');
  const [taxRate, setTaxRate] = useState(p.tax_rate != null ? String(p.tax_rate) : '');
  const [trackInv, setTrackInv] = useState(!!p.track_inventory);
  const [busy, setBusy] = useState(false);
  async function pickFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { setUrl(await fileToDataUrl(f)); } catch { alert('No se pudo leer la imagen'); }
    setBusy(false);
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 max-h-[88vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg">{p.name}</h3>
        <div className="flex items-center gap-3">
          {url ? <img src={url} alt="" className="w-20 h-20 rounded-xl object-cover bg-zinc-100" /> : <div className="w-20 h-20 rounded-xl bg-zinc-100 grid place-items-center text-2xl">🍗</div>}
          <label className="flex-1 text-center px-3 py-2 rounded-xl bg-cartel text-white font-bold text-sm cursor-pointer">
            {busy ? 'Procesando…' : '📷 Subir imagen'}
            <input type="file" accept="image/*" onChange={pickFile} className="hidden" />
          </label>
        </div>
        <input value={url.startsWith('data:') ? '' : url} onChange={(e) => setUrl(e.target.value)} placeholder="…o pega una URL de foto"
          className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-sm" />
        {url.startsWith('data:') && <p className="text-xs text-emerald-600 font-bold">✓ Imagen cargada desde tu equipo</p>}
        <label className="block text-xs font-bold text-zinc-500">Categoría
          <input list="cats-edit" value={category} onChange={(e) => setCategory(e.target.value.toUpperCase())}
            className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none font-bold" />
          <datalist id="cats-edit">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-bold text-zinc-500">Costo {p.has_recipe && <span className="text-zinc-400 font-normal">(usa receta)</span>}
            <input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} disabled={p.has_recipe} placeholder="0"
              className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none disabled:bg-zinc-100" />
          </label>
          <label className="block text-xs font-bold text-zinc-500">Impuesto base %
            <input type="number" min="0" max="100" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0"
              className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
          </label>
        </div>
        <label className="block text-xs font-bold text-zinc-500">Código de referencia (SKU)
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU"
            className="w-full mt-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <input type="checkbox" checked={trackInv} onChange={(e) => setTrackInv(e.target.checked)} />
          Agregar al inventario
        </label>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-zinc-100 font-bold">Cancelar</button>
          <button disabled={busy} onClick={() => onSave({
            image_url: url.trim() || null, category: category.trim(),
            cost: Number(cost || 0), tax_rate: Number(taxRate || 0),
            track_inventory: trackInv, sku: sku.trim() || undefined,
          })}
            className="flex-1 py-2.5 rounded-xl bg-cartel text-white font-black disabled:opacity-50">Guardar</button>
        </div>
      </div>
    </div>
  );
}
