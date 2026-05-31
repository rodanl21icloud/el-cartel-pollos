import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const UNITS = ['unidad', 'gramo', 'mililitro', 'empaque'];

export default function Inventario() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(false);
  const [restockId, setRestockId] = useState(null);

  async function load() {
    try { setItems(await api('/inventory/ingredients')); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2600); }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-xl">Inventario de insumos</h2>
        <button onClick={() => setCreating(!creating)} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">
          {creating ? 'Cancelar' : '+ Nuevo insumo'}
        </button>
      </div>
      {error && <p className="text-red-600 font-semibold">{error}</p>}

      {creating && <NewIngredient onDone={() => { setCreating(false); load(); flash('Insumo creado'); }} onError={setError} />}

      <div className="bg-white rounded-2xl shadow divide-y">
        {items.map((i) => (
          <div key={i.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-black">{i.name}</div>
                <div className="text-sm text-zinc-500">
                  Stock: <b className={i.stock_qty <= i.min_stock_qty ? 'text-red-600' : ''}>{i.stock_qty} {i.unit}</b>
                  {' · '}mín {i.min_stock_qty} · costo {money(i.cost_unit)}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRestockId(restockId === i.id ? null : i.id)}
                  className="px-3 py-2 rounded-lg bg-green-600 text-white font-bold">Reponer</button>
                <button onClick={() => delIngredient(i, load, flash, setError)}
                  className="px-3 py-2 rounded-lg bg-zinc-200 font-bold">Eliminar</button>
              </div>
            </div>
            {restockId === i.id && (
              <RestockForm ingredient={i} onDone={(r) => { setRestockId(null); load(); flash(`${r.ingredient}: ${r.new_stock} ${i.unit}`); }} onError={setError} />
            )}
          </div>
        ))}
        {!items.length && <p className="p-4 text-zinc-400">Sin insumos. Crea el primero.</p>}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>
      )}
    </div>
  );
}

async function delIngredient(i, reload, flash, setError) {
  setError('');
  try {
    await api(`/inventory/ingredients/${i.id}`, { method: 'DELETE' });
    flash(`${i.name} eliminado`); reload();
  } catch (e) {
    setError(e.message === 'INSUMO_EN_USO'
      ? `No se puede eliminar "${i.name}": está en una receta. Quítalo de las recetas primero.`
      : e.message === 'OTP_GERENCIA_REQUERIDO' ? 'Eliminar requiere OTP de gerencia' : e.message);
  }
}

function NewIngredient({ onDone, onError }) {
  const [f, setF] = useState({ name: '', unit: 'unidad', stock_qty: '', min_stock_qty: '', cost_unit: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    onError('');
    try {
      await api('/inventory/ingredients', {
        method: 'POST',
        body: {
          name: f.name.trim(), unit: f.unit,
          stock_qty: Number(f.stock_qty || 0), min_stock_qty: Number(f.min_stock_qty || 0), cost_unit: Number(f.cost_unit || 0),
        },
      });
      onDone();
    } catch (e) { onError(e.message === 'NOMBRE_DUPLICADO' ? 'Ya existe un insumo con ese nombre' : e.message); }
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow space-y-2">
      <input placeholder="Nombre del insumo" value={f.name} onChange={set('name')}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="grid grid-cols-2 gap-2">
        <select value={f.unit} onChange={set('unit')} className="px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none">
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="number" min="0" placeholder="Costo unitario" value={f.cost_unit} onChange={set('cost_unit')}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <input type="number" min="0" placeholder="Stock inicial" value={f.stock_qty} onChange={set('stock_qty')}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <input type="number" min="0" placeholder="Stock mínimo (alerta)" value={f.min_stock_qty} onChange={set('min_stock_qty')}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      </div>
      <button onClick={save} className="w-full btn-pos bg-cartel text-white">Crear insumo</button>
    </div>
  );
}

function RestockForm({ ingredient, onDone, onError }) {
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(String(ingredient.cost_unit));
  const [linkExpense, setLinkExpense] = useState(true);
  const [metodo, setMetodo] = useState('EFECTIVO');
  const monto = (Number(qty) || 0) * (Number(cost) || 0);
  async function save() {
    onError('');
    if (!(Number(qty) > 0)) return onError('Cantidad inválida');
    try {
      const r = await api(`/inventory/ingredients/${ingredient.id}/restock`, {
        method: 'POST',
        body: {
          qty: Number(qty), unit_cost: Number(cost),
          expense: linkExpense ? { payment_method: metodo } : undefined,
        },
      });
      onDone(r);
    } catch (e) { onError(e.message); }
  }
  return (
    <div className="mt-3 bg-zinc-50 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" placeholder={`Cantidad (${ingredient.unit})`} value={qty} onChange={(e) => setQty(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <input type="number" min="0" placeholder="Costo unitario" value={cost} onChange={(e) => setCost(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={linkExpense} onChange={(e) => setLinkExpense(e.target.checked)} />
        Registrar como gasto ({money(monto)})
      </label>
      {linkExpense && (
        <div className="flex gap-2">
          {['EFECTIVO', 'POS', 'TRANSFERENCIA'].map((m) => (
            <button key={m} onClick={() => setMetodo(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${metodo === m ? 'bg-cartel text-white' : 'bg-zinc-200'}`}>{m}</button>
          ))}
        </div>
      )}
      <button onClick={save} className="w-full rounded-xl bg-green-600 text-white font-bold py-2">Confirmar reposición</button>
    </div>
  );
}
