import { useState } from 'react';
import { api } from '../../lib/api.js';
import { validarNombreProducto } from '../../lib/productName.js';

// Edición del NOMBRE de un producto, con la misma validación bloqueante.
// Permite corregir nombres de código como ".UPBEB125".
export default function RenameModal({ product, otp, onClose, onSaved, onError }) {
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
