import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Motivos predefinidos (Poka-yoke: sin texto libre salvo "Otro").
const MOTIVOS = ['Mal estado', 'Caída / derrame', 'Error de preparación', 'Vencido', 'Otro'];

export default function Merma() {
  const [ingredients, setIngredients] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sel, setSel] = useState(null);     // ingrediente seleccionado
  const [qty, setQty] = useState('');
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const [ings, al] = await Promise.all([
      api('/inventory/ingredients'),
      api('/inventory/alerts'),
    ]);
    setIngredients(ings);
    setAlerts(al.alerts);
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function submit() {
    setError('');
    const reason = motivo === 'Otro' ? otro.trim() : motivo;
    if (!sel) return setError('Selecciona un insumo');
    if (!(Number(qty) > 0)) return setError('Cantidad inválida');
    if (!reason) return setError('Indica el motivo');
    try {
      const r = await api('/inventory/merma', {
        method: 'POST',
        body: { ingredient_id: sel.id, qty: Number(qty), reason, type: 'MERMA' },
      });
      setToast(`Merma registrada · ${r.ingredient}: ${r.new_stock} restante`);
      setSel(null); setQty(''); setMotivo(''); setOtro('');
      await load();
    } catch (e) {
      setError(e.message);
    }
    setTimeout(() => setToast(null), 2800);
  }

  return (
    <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-4">
      {/* Selección de insumo */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h2 className="font-black text-lg mb-3">Registrar merma</h2>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {ingredients.map((i) => (
            <button key={i.id} onClick={() => setSel(i)}
              className={`btn-pos text-left ${sel?.id === i.id ? 'bg-cartel text-white' : 'bg-zinc-100 text-zinc-800'}`}>
              <div className="text-base font-black">{i.name}</div>
              <div className="text-sm opacity-80">{i.stock_qty} {i.unit}</div>
            </button>
          ))}
        </div>

        {sel && (
          <>
            <label className="block font-bold text-zinc-700 mb-1">Cantidad ({sel.unit})</label>
            <input type="number" min="0" inputMode="decimal" value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full mb-3 px-4 py-3 text-xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

            <label className="block font-bold text-zinc-700 mb-1">Motivo</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {MOTIVOS.map((m) => (
                <button key={m} onClick={() => setMotivo(m)}
                  className={`rounded-xl py-3 font-bold ${motivo === m ? 'bg-cartel text-white' : 'bg-zinc-100'}`}>
                  {m}
                </button>
              ))}
            </div>
            {motivo === 'Otro' && (
              <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Especifica el motivo"
                className="w-full mb-3 px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            )}

            {error && <p className="text-red-600 font-semibold my-2">{error}</p>}
            <button onClick={submit} className="w-full btn-pos bg-cartel text-white mt-2">
              Confirmar merma
            </button>
          </>
        )}
      </div>

      {/* Alertas de stock */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h2 className="font-black text-lg mb-3">⚠️ Stock bajo</h2>
        {alerts.length ? (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="flex justify-between bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <span className="font-bold">{a.name}</span>
                <span className="text-red-600 font-bold">{a.stock_qty} / mín {a.min_stock_qty} {a.unit}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-400">Todo el inventario sobre el mínimo.</p>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">
          {toast}
        </div>
      )}
    </div>
  );
}
