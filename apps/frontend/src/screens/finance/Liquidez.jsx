import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Spinner, ErrorState } from '../../components/ui/States.jsx';

// Liquidez: caja libre hoy y a 30 días, excedente retirable y escenarios.
// CAJA ≠ utilidad contable (se explica en la UI).
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

export default function Liquidez() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [scn, setScn] = useState({ kind: 'RETIRO', delta_amount: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null); setD(null); setResult(null);
    try { setD(await api('/finance/liquidity/summary')); } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!d) return <Spinner label="Calculando liquidez…" />;

  async function simular() {
    if (!(Number(scn.delta_amount) > 0)) return;
    setBusy(true);
    try { setResult(await api('/finance/liquidity/scenarios', { method: 'POST', body: { kind: scn.kind, delta_amount: Number(scn.delta_amount) } })); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* Resumen ejecutivo */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="card p-5 bg-emerald-600 text-white">
          <div className="text-sm opacity-80">Caja libre hoy</div>
          <div className="text-4xl font-black tabular-nums">{money(d.free_cash)}</div>
          <div className="text-xs opacity-70 mt-1">Excedente retirable: <b>{money(d.withdrawable_cash)}</b></div>
        </div>
        <div className="card p-5 bg-ink text-white">
          <div className="text-sm opacity-80">Caja proyectada en 30 días</div>
          <div className="text-4xl font-black tabular-nums">{money(d.projected_cash_30d)}</div>
          <div className="text-xs opacity-70 mt-1">Colchón mínimo: {money(d.min_buffer)}</div>
        </div>
      </div>

      {/* Desglose de caja */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cell label="Caja actual" v={money(d.current_cash)} />
        <Cell label="Reservado (colchón + impuestos)" v={money(d.operational_cash)} />
        <Cell label="Comprometido (impuestos)" v={money(d.committed_cash)} />
        <Cell label="Caja libre" v={money(d.free_cash)} strong />
      </div>

      {/* Proyección 7/15/30 */}
      <div className="card p-4">
        <h3 className="font-black mb-3">Proyección de caja</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Horizon label="7 días" v={d.projected_cash_7d} buffer={d.min_buffer} />
          <Horizon label="15 días" v={d.projected_cash_15d} buffer={d.min_buffer} />
          <Horizon label="30 días" v={d.projected_cash_30d} buffer={d.min_buffer} />
        </div>
        <p className="text-xs text-ink-mute mt-3">
          Flujo neto diario estimado: <b>{money(d.breakdown.daily_net)}</b> · Ventas 30d {money(d.breakdown.ventas_30d)} − Egresos 30d {money(d.breakdown.egresos_30d)}
        </p>
      </div>

      {/* Escenarios */}
      <div className="card p-4">
        <h3 className="font-black mb-3">Escenario “¿qué pasa si…?”</h3>
        <div className="flex gap-2 items-end flex-wrap">
          <label className="text-sm"><span className="text-[11px] text-ink-mute font-bold block">Acción</span>
            <select value={scn.kind} onChange={(e) => setScn({ ...scn, kind: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 font-bold">
              <option value="RETIRO">Retiro de utilidades</option><option value="COMPRA">Compra</option><option value="INVERSION">Inversión / nueva operación</option><option value="INGRESO">Ingreso de capital</option>
            </select>
          </label>
          <label className="text-sm"><span className="text-[11px] text-ink-mute font-bold block">Monto</span>
            <input type="number" value={scn.delta_amount} onChange={(e) => setScn({ ...scn, delta_amount: e.target.value })} placeholder="500000" className="w-36 px-2 py-2 rounded-lg border-2 border-slate-200 tabular-nums" />
          </label>
          <button onClick={simular} disabled={busy} className="px-4 py-2 rounded-xl bg-cartel text-white font-black disabled:opacity-60">{busy ? '…' : 'Calcular'}</button>
        </div>

        {result && (
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <Cell label="Caja libre actual" v={money(result.base.free_cash)} />
            <Cell label="Caja libre simulada" v={money(result.after.free_cash)} strong />
            <Cell label="Estado" v={result.after.salud === 'OK' ? '✅ OK' : result.after.salud === 'AJUSTADO' ? '⚠️ Ajustado' : '🔴 Bajo colchón'}
              cls={result.after.salud === 'BAJO_COLCHON' ? 'text-cartel' : result.after.salud === 'AJUSTADO' ? 'text-amber-600' : 'text-emerald-600'} />
          </div>
        )}
      </div>

      <ul className="text-[11px] text-ink-mute list-disc pl-4 space-y-0.5">
        {d.assumptions.map((a, i) => <li key={i}>{a}</li>)}
      </ul>
      <p className="text-[11px] text-ink-mute font-bold">{d.disclaimer}</p>
    </div>
  );
}

const Cell = ({ label, v, strong, cls = '' }) => (
  <div className="card p-3">
    <div className="text-[11px] text-ink-mute">{label}</div>
    <div className={`tabular-nums ${strong ? 'font-black text-lg' : 'font-bold'} ${cls}`}>{v}</div>
  </div>
);
const Horizon = ({ label, v, buffer }) => (
  <div className={`rounded-xl p-3 ${v < buffer ? 'bg-cartel/10' : 'bg-slate-50'}`}>
    <div className="text-[11px] text-ink-mute">{label}</div>
    <div className={`tabular-nums font-black ${v < buffer ? 'text-cartel' : ''}`}>{money(v)}</div>
    {v < buffer && <div className="text-[10px] text-cartel">bajo colchón</div>}
  </div>
);
