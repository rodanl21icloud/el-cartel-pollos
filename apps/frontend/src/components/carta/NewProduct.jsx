import { useState } from 'react';
import { validarNombreProducto } from '../../lib/productName.js';
import { CAT_ORDER } from './cartaShared.js';

export default function NewProduct({ onSave, existingCats }) {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('POLLO');
  const [imageUrl, setImageUrl] = useState('');
  const [cost, setCost] = useState('');
  const [sku, setSku] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [trackInv, setTrackInv] = useState(false);
  const nameErr = validarNombreProducto(name);          // '' si es válido

  const margen = Number(price) > 0 ? Math.round((1 - (Number(cost) || 0) / Number(price)) * 100) : null;

  function submit() {
    setTouched(true);
    if (nameErr) return;                                 // bloquea el submit si el nombre es inválido
    onSave({
      name: name.trim(), price: Number(price || 0), category,
      image_url: imageUrl.trim() || undefined,
      cost: Number(cost || 0), tax_rate: Number(taxRate || 0),
      track_inventory: trackInv, sku: sku.trim() || undefined,
    });
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
        <div>
          <input list="cats-new" value={category} onChange={(e) => setCategory(e.target.value.toUpperCase())} placeholder="Categoría"
            className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none font-bold" />
          <datalist id="cats-new">{[...new Set([...CAT_ORDER, ...(existingCats || []), 'OTROS'])].map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <input type="number" min="0" placeholder="Costo (si no usas receta)" value={cost} onChange={(e) => setCost(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
          {margen != null && cost !== '' && <p className="text-[11px] text-zinc-500 mt-0.5">Margen ≈ {margen}%</p>}
        </div>
        <input type="number" min="0" max="100" placeholder="Impuesto base %" value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      </div>
      <input placeholder="Código de referencia (SKU) — opcional" value={sku} onChange={(e) => setSku(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <input placeholder="URL de foto (opcional)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700 px-1 py-1">
        <input type="checkbox" checked={trackInv} onChange={(e) => setTrackInv(e.target.checked)} />
        Agregar al inventario <span className="text-xs text-zinc-400 font-normal">(productos que llevas en stock directo)</span>
      </label>
      <button onClick={submit} disabled={!!nameErr}
        className="w-full btn-pos bg-cartel text-white disabled:opacity-50 disabled:cursor-not-allowed">Crear plato</button>
    </div>
  );
}
