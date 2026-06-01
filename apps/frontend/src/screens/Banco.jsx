import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

// Conciliación bancaria: saldo, movimientos, comparación con el sistema,
// y registro manual de cualquier movimiento de dinero.
export default function Banco({ role }) {
  const [sum, setSum] = useState(null);
  const [rec, setRec] = useState([]);
  const [movs, setMovs] = useState([]);
  const [q, setQ] = useState('');
  const [dir, setDir] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const canAdd = role === 'GERENCIA';

  async function load() {
    try {
      const [s, r] = await Promise.all([api('/bank/summary'), api('/bank/reconcile')]);
      setSum(s); setRec(r);
      loadMovs();
    } catch (e) { setError(e.message); }
  }
  async function loadMovs() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (dir) params.set('dir', dir);
    try { setMovs(await api(`/bank/movements?${params}`)); } catch { /* */ }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(loadMovs, 300); return () => clearTimeout(t); }, [q, dir]);

  if (error && !sum) return <p className="text-red-600 text-center mt-10">{error}</p>;
  if (!sum) return <p className="text-ink-mute text-center mt-10">Cargando conciliación…</p>;

  const ingCats = sum.por_categoria.filter((c) => c.direction === 'INGRESO');
  const egrCats = sum.por_categoria.filter((c) => c.direction === 'EGRESO');

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Saldo + KPIs */}
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="card p-4 sm:col-span-1 bg-ink text-white">
          <div className="text-[11px] uppercase tracking-wide text-slate-300">Saldo en banco</div>
          <div className="text-2xl font-black">{money(sum.saldo)}</div>
          <div className="text-[11px] text-slate-400">al {sum.saldo_fecha || '—'}</div>
        </div>
        <KPI label="Ingresos" value={money(sum.ingresos)} color="text-emerald-600" />
        <KPI label="Egresos" value={money(sum.egresos)} color="text-cartel" />
        <KPI label="Neto" value={money(sum.neto)} color={sum.neto >= 0 ? 'text-emerald-700' : 'text-cartel'} />
      </div>

      {/* Conciliación banco vs sistema */}
      <div className="card p-4">
        <h3 className="font-black mb-1">Conciliación banco ↔ sistema (por mes)</h3>
        <p className="text-xs text-ink-mute mb-3">Compara las transferencias del banco con las ventas por transferencia del POS, y los egresos del banco con los gastos registrados.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-ink-mute border-b">
                <th className="py-2">Mes</th>
                <th className="text-right">Ingresos banco</th>
                <th className="text-right">Ventas transf. POS</th>
                <th className="text-right">Dif.</th>
                <th className="text-right">Egresos banco</th>
                <th className="text-right">Gastos sistema</th>
              </tr>
            </thead>
            <tbody>
              {rec.map((r) => (
                <tr key={r.mes} className="border-b last:border-0">
                  <td className="py-2 font-semibold">{r.mes}</td>
                  <td className="text-right text-emerald-600">{money(r.banco_ing)}</td>
                  <td className="text-right">{money(r.sis_transf)}</td>
                  <td className={`text-right font-bold ${Math.abs(r.dif_ingresos) < 1 ? 'text-emerald-600' : 'text-amber-600'}`}>{money(r.dif_ingresos)}</td>
                  <td className="text-right text-cartel">{money(r.banco_egr)}</td>
                  <td className="text-right">{money(r.sis_gastos)}</td>
                </tr>
              ))}
              {!rec.length && <tr><td colSpan="6" className="py-3 text-ink-mute">Sin datos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Egresos por categoría */}
        <div className="card p-4">
          <h3 className="font-black mb-3">Egresos por categoría</h3>
          <ul className="space-y-1 text-sm">
            {egrCats.map((c) => (
              <li key={c.category} className="flex justify-between"><span>{c.category} <span className="text-ink-mute text-xs">({c.n})</span></span><b>{money(c.monto)}</b></li>
            ))}
          </ul>
        </div>
        {/* Top contrapartes (egresos) */}
        <div className="card p-4">
          <h3 className="font-black mb-3">Principales destinos</h3>
          <ul className="space-y-1 text-sm">
            {sum.top_egresos.map((c) => (
              <li key={c.counterpart} className="flex justify-between"><span className="truncate pr-2">{c.counterpart}</span><b className="whitespace-nowrap">{money(c.monto)}</b></li>
            ))}
          </ul>
        </div>
      </div>

      {/* Movimientos */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="font-black">Movimientos</h3>
          {canAdd && <button onClick={() => setAdding(!adding)} className="px-3 py-1.5 rounded-xl bg-cartel text-white font-bold text-sm">{adding ? 'Cancelar' : '+ Registrar movimiento'}</button>}
        </div>
        {adding && <AddMovement onSaved={() => { setAdding(false); load(); }} onError={setError} />}
        <div className="flex gap-2 mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="field flex-1" />
          <select value={dir} onChange={(e) => setDir(e.target.value)} className="field w-40">
            <option value="">Todos</option><option value="INGRESO">Ingresos</option><option value="EGRESO">Egresos</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-ink-mute border-b"><th className="py-2">Fecha</th><th>Detalle</th><th>Categoría</th><th className="text-right">Monto</th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2 whitespace-nowrap">{m.fecha}</td>
                  <td><div className="font-semibold">{m.counterpart || m.description}</div><div className="text-xs text-ink-mute">{m.description}</div></td>
                  <td className="text-xs">{m.category}</td>
                  <td className={`text-right font-bold whitespace-nowrap ${m.direction === 'INGRESO' ? 'text-emerald-600' : 'text-cartel'}`}>{m.direction === 'INGRESO' ? '+' : '−'} {money(m.amount)}</td>
                </tr>
              ))}
              {!movs.length && <tr><td colSpan="4" className="py-3 text-ink-mute">Sin movimientos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, color }) {
  return (
    <div className="card p-4 text-center">
      <div className="text-[11px] text-ink-mute uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-black ${color}`}>{value}</div>
    </div>
  );
}

function AddMovement({ onSaved, onError }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ fecha: today, amount: '', direction: 'EGRESO', counterpart: '', category: 'Otros', description: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    try {
      await api('/bank/movements', { method: 'POST', body: { ...f, amount: Number(f.amount) } });
      onSaved();
    } catch (e) { onError(e.message); }
  }
  return (
    <div className="bg-slate-50 rounded-xl p-3 mb-3 space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input type="date" value={f.fecha} onChange={set('fecha')} className="field" />
        <input type="number" min="0" placeholder="Monto" value={f.amount} onChange={set('amount')} className="field" />
        <select value={f.direction} onChange={set('direction')} className="field"><option value="EGRESO">Egreso</option><option value="INGRESO">Ingreso</option></select>
        <input placeholder="Categoría" value={f.category} onChange={set('category')} className="field" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Contraparte" value={f.counterpart} onChange={set('counterpart')} className="field" />
        <input placeholder="Descripción" value={f.description} onChange={set('description')} className="field" />
      </div>
      <button onClick={save} className="w-full btn-pos bg-cartel text-white">Registrar</button>
    </div>
  );
}
