import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const METODOS = [
  { id: 'EFECTIVO', label: '💵 Efectivo' },
  { id: 'POS', label: '💳 POS' },
  { id: 'TRANSFERENCIA', label: '📲 Transferencia' },
];
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }); } catch { return ''; } };

export default function Gastos() {
  const [cats, setCats] = useState([]);
  const [list, setList] = useState([]);
  const [editing, setEditing] = useState(null);
  const [catId, setCatId] = useState('');
  const [amount, setAmount] = useState('');
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [desc, setDesc] = useState('');
  const [supplier, setSupplier] = useState('');
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');

  function loadList() { api('/expenses').then(setList).catch(() => {}); }
  useEffect(() => { api('/expenses/categories').then(setCats).catch(() => {}); loadList(); }, []);
  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2800); }

  async function submit() {
    setError('');
    if (!catId) return setError('Elige una categoría');
    if (!(Number(amount) > 0)) return setError('Monto inválido');
    if (!desc.trim()) return setError('Agrega una descripción');
    try {
      const r = await api('/expenses', {
        method: 'POST',
        body: { category_id: catId, amount: Number(amount), payment_method: metodo, description: desc.trim(), supplier: supplier.trim() || undefined },
      });
      flash(`Gasto registrado · ${r.category} · ${money(amount)}`);
      setAmount(''); setDesc(''); setSupplier(''); setCatId(''); loadList();
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="bg-white rounded-2xl p-5 shadow">
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
              className={`rounded-xl py-3 font-bold ${metodo === m.id ? 'bg-cartel text-white' : 'bg-zinc-100'}`}>{m.label}</button>
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
      </div>

      {/* Gastos recientes (ver + editar) */}
      <div className="bg-white rounded-2xl p-5 shadow">
        <h3 className="font-black mb-3">Gastos recientes</h3>
        {!list.length ? <p className="text-zinc-500 text-sm">Aún no hay gastos registrados.</p> : (
          <ul className="divide-y">
            {list.map((g) => (
              <li key={g.id} className="py-2 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{g.description}</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {fecha(g.spent_at)} · {g.category} · {g.payment_method}{g.supplier ? ` · ${g.supplier}` : ''}
                    {g.kind === 'RETIRO' && ' · retiro'}
                  </div>
                </div>
                <div className="font-black tabular-nums whitespace-nowrap">{money(g.amount)}</div>
                <button onClick={() => setEditing(g)} className="px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-700 font-bold text-sm">Editar</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <EditModal expense={editing} cats={cats} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadList(); flash('Gasto actualizado'); }} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>
      )}
    </div>
  );
}

function EditModal({ expense, cats, onClose, onSaved }) {
  const [catId, setCatId] = useState(expense.category_id || '');
  const [amount, setAmount] = useState(String(expense.amount));
  const [metodo, setMetodo] = useState(expense.payment_method);
  const [desc, setDesc] = useState(expense.description || '');
  const [supplier, setSupplier] = useState(expense.supplier || '');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  async function save() {
    setErr('');
    if (!catId) return setErr('Elige una categoría');
    if (!(Number(amount) > 0)) return setErr('Monto inválido');
    if (!desc.trim()) return setErr('Agrega una descripción');
    setBusy(true);
    try {
      await api(`/expenses/${expense.id}`, {
        method: 'PUT',
        body: { category_id: catId, amount: Number(amount), payment_method: metodo, description: desc.trim(), supplier: supplier.trim() || undefined },
      });
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-3">Editar gasto</h3>

        <label className="block font-bold text-zinc-700 mb-1 text-sm">Categoría</label>
        <select value={catId} onChange={(e) => setCatId(e.target.value)} className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none">
          <option value="">—</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kind === 'RETIRO' ? ' (retiro)' : ''}</option>)}
        </select>

        <label className="block font-bold text-zinc-700 mb-1 text-sm">Monto</label>
        <input type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-full mb-3 px-3 py-2 text-xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

        <label className="block font-bold text-zinc-700 mb-1 text-sm">Pagado con</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {METODOS.map((m) => (
            <button key={m.id} onClick={() => setMetodo(m.id)} className={`rounded-lg py-2 text-sm font-bold ${metodo === m.id ? 'bg-cartel text-white' : 'bg-zinc-100'}`}>{m.label}</button>
          ))}
        </div>

        <label className="block font-bold text-zinc-700 mb-1 text-sm">Descripción</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

        <label className="block font-bold text-zinc-700 mb-1 text-sm">Proveedor (opcional)</label>
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

        {err && <p className="text-red-600 font-semibold mb-2 text-sm">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-zinc-100 text-zinc-700 font-bold">Cancelar</button>
          <button onClick={save} disabled={busy} className="flex-[2] btn-pos bg-cartel text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  );
}
