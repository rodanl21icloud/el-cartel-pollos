import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { humanizeError } from '../components/ui/States.jsx';

// Motivos predefinidos (Poka-yoke: sin texto libre salvo "Otro").
const MOTIVOS = ['Mal estado', 'Caída / derrame', 'Error de preparación', 'Vencido', 'Otro'];
const SEV = { AGOTADO: 'bg-red-600 text-white border-red-600', CRITICO: 'bg-red-100 text-red-700 border-red-300', BAJO: 'bg-amber-100 text-amber-700 border-amber-300' };
const fecha = (iso) => { try { return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };

export default function Merma() {
  const [ingredients, setIngredients] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [hist, setHist] = useState(null);
  const [sel, setSel] = useState(null);     // ingrediente seleccionado
  const [qty, setQty] = useState('');
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    const [ings, al, h] = await Promise.all([
      api('/inventory/ingredients'),
      api('/inventory/alerts'),
      api('/inventory/mermas?days=30').catch(() => null),
    ]);
    setIngredients(ings);
    setAlerts(al.alerts);
    setHist(h);
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
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
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

            {error && <p className="text-red-600 font-semibold my-2">{humanizeError(error)}</p>}
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
            {alerts.map((a) => {
              const sev = SEV[a.severidad] || SEV.BAJO;
              return (
                <li key={a.id} className="bg-white border rounded-xl px-3 py-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{a.name}</span>
                    <span className={`text-xs font-black px-2 py-0.5 rounded-full border ${sev}`}>{a.severidad}</span>
                  </div>
                  <div className="text-xs text-zinc-500 flex justify-between mt-0.5">
                    <span>{a.stock_qty} / mín {a.min_stock_qty} {a.unit}</span>
                    <span>{a.dias_a_quiebre != null ? `~${a.dias_a_quiebre} día(s) a quiebre` : 'sin consumo reciente'}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-zinc-400">Todo el inventario sobre el mínimo.</p>
        )}
      </div>
      </div>

      {/* Historial de mermas (últimos 30 días) */}
      {hist && (
        <div className="bg-white rounded-2xl p-4 shadow">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-lg">📉 Historial de mermas (30 días)</h2>
            <span className="text-sm text-zinc-500">Costo total: <b>${Number(hist.total_costo).toLocaleString('es-CL')}</b></span>
          </div>
          {!hist.por_insumo.length ? <p className="text-zinc-400">Sin mermas registradas en el período.</p> : (
            <>
              <div className="grid sm:grid-cols-2 gap-2 mb-3">
                {hist.por_insumo.map((p) => (
                  <div key={p.name} className="flex justify-between bg-zinc-50 rounded-xl px-3 py-2 text-sm">
                    <span className="font-semibold">{p.name} <span className="text-zinc-400">×{p.n}</span></span>
                    <span className="tabular-nums">{p.qty} {p.unit} · ${Number(p.costo).toLocaleString('es-CL')}</span>
                  </div>
                ))}
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-bold text-zinc-600">Ver detalle ({hist.detalle.length})</summary>
                <ul className="mt-2 divide-y text-sm">
                  {hist.detalle.map((d, i) => (
                    <li key={i} className="py-1.5 flex justify-between gap-2">
                      <span className="min-w-0"><b>{d.name}</b> · {d.reason}<span className="block text-xs text-zinc-400">{fecha(d.fecha)} · {d.usuario}</span></span>
                      <span className="whitespace-nowrap tabular-nums">{d.qty} {d.unit}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">
          {toast}
        </div>
      )}
    </div>
  );
}
