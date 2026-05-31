import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const METODOS = [
  { id: 'EFECTIVO', label: '💵 Efectivo' },
  { id: 'POS', label: '💳 POS' },
  { id: 'TRANSFERENCIA', label: '📲 Transferencia' },
];

export default function Gastos() {
  const [cats, setCats] = useState([]);
  const [catId, setCatId] = useState('');
  const [amount, setAmount] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [desc, setDesc] = useState('');
  const [supplier, setSupplier] = useState('');
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/expenses/categories').then(setCats).catch(() => {}); }, []);

  async function submit() {
    setError('');
    if (!catId) return setError('Elige una categoría');
    if (!(Number(amount) > 0)) return setError('Monto inválido');
    if (!desc.trim()) return setError('Agrega una descripción');
    try {
      const r = await api('/expenses', {
        method: 'POST',
        body: {
          category_id: catId,
          amount: Number(amount),
          payment_method: metodo,
          description: desc.trim(),
          supplier: supplier.trim() || undefined,
        },
      });
      setToast(`Gasto registrado · ${r.category} · $${Number(amount).toLocaleString('es-CL')}`);
      setAmount(''); setDesc(''); setSupplier(''); setCatId('');
    } catch (e) {
      setError(e.message);
    }
    setTimeout(() => setToast(null), 2800);
  }

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl p-5 shadow">
      <h2 className="font-black text-xl mb-4">Registrar gasto</h2>

      <label className="block font-bold text-zinc-700 mb-1">Categoría</label>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {cats.map((c) => (
          <button key={c.id} onClick={() => setCatId(c.id)}
            className={`rounded-xl py-4 px-3 font-bold text-left ${catId === c.id ? 'bg-cartel text-white' : 'bg-zinc-100 text-zinc-800'}`}>
            {c.name}
            {c.kind === 'RETIRO' && <span className="block text-xs opacity-70">retiro</span>}
          </button>
        ))}
      </div>

      <label className="block font-bold text-zinc-700 mb-1">Monto</label>
      <input type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
        className="w-full mb-4 px-4 py-3 text-2xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

      <label className="block font-bold text-zinc-700 mb-1">Pagado con</label>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {METODOS.map((m) => (
          <button key={m.id} onClick={() => setMetodo(m.id)}
            className={`rounded-xl py-3 font-bold ${metodo === m.id ? 'bg-cartel text-white' : 'bg-zinc-100'}`}>
            {m.label}
          </button>
        ))}
      </div>

      <label className="block font-bold text-zinc-700 mb-1">Descripción</label>
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej: compra de pollo"
        className="w-full mb-3 px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

      <label className="block font-bold text-zinc-700 mb-1">Proveedor (opcional)</label>
      <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ej: Avícola Sur"
        className="w-full mb-4 px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

      {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
      <button onClick={submit} className="w-full btn-pos bg-cartel text-white">Guardar gasto</button>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">
          {toast}
        </div>
      )}
    </div>
  );
}
