import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Spinner, ErrorState } from '../../components/ui/States.jsx';
import { KpiCard } from '../../components/ui/kit.jsx';

// Tax Forecaster: proyección de IVA (débito/crédito/neto) + PPM del mes, con
// simulador "antes/después" de compras hipotéticas. Todo es ESTIMACIÓN.
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function TaxForecaster() {
  const [period, setPeriod] = useState(thisMonth());
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const [sim, setSim] = useState([]);
  const [cfgOpen, setCfgOpen] = useState(false);

  async function load() {
    setError(null); setF(null);
    try { setF(await api(`/finance/tax/forecast?period=${period}`)); } catch (e) { setError(e); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!f) return <Spinner label="Proyectando impuestos…" />;

  // Impacto del simulador (mismo criterio que el backend): compra/inversión suma crédito; venta suma débito.
  const rate = f.config.iva_rate;
  let dDeb = 0, dCred = 0;
  for (const e of sim) {
    const iva = (Number(e.net_amount) || 0) * rate;
    if (e.type === 'VENTA') dDeb += iva; else dCred += iva;
  }
  const afterNeto = (f.iva_debito + Math.round(dDeb)) - (f.iva_credito + Math.round(dCred));
  const afterPagar = Math.max(0, afterNeto) + f.ppm;
  const deltaPagar = afterPagar - f.a_pagar_estimado;

  const addRow = () => setSim((s) => [...s, { type: 'COMPRA', description: '', net_amount: 0 }]);
  const setRow = (i, k, v) => setSim((s) => s.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const delRow = (i) => setSim((s) => s.filter((_, j) => j !== i));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink-mute">Período</span>
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="px-2 py-1.5 rounded-lg border-2 border-slate-200 font-bold" />
        </div>
        <button onClick={() => setCfgOpen((v) => !v)} className="text-sm text-cartel font-bold">⚙ Parámetros</button>
      </div>

      {cfgOpen && <ConfigEditor cfg={f.config} onSaved={load} />}

      {/* Frase ejecutiva */}
      <div className="card p-4 bg-ink text-white">
        <div className="text-sm opacity-80">Si cierras {period} hoy, pagarías aprox.</div>
        <div className="text-4xl font-black tabular-nums">{money(f.a_pagar_estimado)}</div>
        <div className="text-xs opacity-70 mt-1">IVA neto {money(Math.max(0, f.iva_neto))} + PPM {money(f.ppm)}</div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="IVA débito (ventas)" value={money(f.iva_debito)} hint={`Ventas netas ${money(f.ventas_netas)}`} />
        <KpiCard label="IVA crédito (confirmado)" value={money(f.iva_credito)} hint={`Potencial ${money(f.iva_credito_potencial)}`} />
        <KpiCard label="IVA neto" value={money(f.iva_neto)} invert />
        <KpiCard label="PPM estimado" value={money(f.ppm)} hint={`tasa ${f.config.ppm_rate}`} />
      </div>

      {f.gastos_sin_credito > 0 && (
        <p className="text-xs text-amber-600">⚠️ {money(f.gastos_sin_credito)} en gastos sin documento → no suman crédito. Complétalos en Auditoría para bajar el IVA a pagar.</p>
      )}

      {/* Simulador antes/después */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-black">Simulador “¿qué pasa si compro/invierto?”</h3>
          <button onClick={addRow} className="text-sm font-bold text-cartel">+ Agregar</button>
        </div>
        {sim.length === 0 ? <p className="text-ink-mute text-sm">Agrega una compra hipotética (freidora, stock, mantención…) y mira el impacto en el IVA a pagar.</p>
          : (
            <div className="space-y-2">
              {sim.map((e, i) => (
                <div key={i} className="flex gap-2 items-center flex-wrap">
                  <select value={e.type} onChange={(ev) => setRow(i, 'type', ev.target.value)} className="px-2 py-1.5 rounded-lg border-2 border-slate-200 text-sm font-bold">
                    <option value="COMPRA">Compra</option><option value="INVERSION">Inversión</option><option value="VENTA">Venta extra</option>
                  </select>
                  <input placeholder="Descripción" value={e.description} onChange={(ev) => setRow(i, 'description', ev.target.value)} className="flex-1 min-w-[120px] px-2 py-1.5 rounded-lg border-2 border-slate-200 text-sm" />
                  <input type="number" placeholder="Monto neto" value={e.net_amount} onChange={(ev) => setRow(i, 'net_amount', ev.target.value)} className="w-32 px-2 py-1.5 rounded-lg border-2 border-slate-200 text-sm tabular-nums" />
                  <button onClick={() => delRow(i)} className="text-ink-mute hover:text-cartel">✕</button>
                </div>
              ))}
            </div>
          )}

        {sim.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <Box label="A pagar actual" v={money(f.a_pagar_estimado)} />
            <Box label="A pagar simulado" v={money(afterPagar)} strong />
            <Box label="Diferencia" v={(deltaPagar > 0 ? '+' : '') + money(deltaPagar)} cls={deltaPagar < 0 ? 'text-emerald-600' : 'text-cartel'} />
          </div>
        )}
      </div>

      <ul className="text-[11px] text-ink-mute list-disc pl-4 space-y-0.5">
        {f.assumptions.map((a, i) => <li key={i}>{a}</li>)}
      </ul>
      <p className="text-[11px] text-ink-mute font-bold">{f.disclaimer}</p>
    </div>
  );
}

const Box = ({ label, v, cls = '', strong }) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <div className="text-[11px] text-ink-mute">{label}</div>
    <div className={`tabular-nums ${strong ? 'font-black text-lg' : 'font-bold'} ${cls}`}>{v}</div>
  </div>
);

function ConfigEditor({ cfg, onSaved }) {
  const [iva, setIva] = useState(cfg.iva_rate);
  const [ppm, setPpm] = useState(cfg.ppm_rate);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setSaving(true); setErr('');
    try { await api('/finance/tax/config', { method: 'PUT', body: { iva_rate: Number(iva), ppm_rate: Number(ppm) } }); onSaved(); }
    catch (e) { setErr(e.message === 'PERMISO_DENEGADO' ? 'Solo gerencia puede cambiar parámetros.' : e.message); }
    finally { setSaving(false); }
  }
  return (
    <div className="card p-4 flex items-end gap-3 flex-wrap">
      <label className="text-sm"><span className="text-[11px] text-ink-mute font-bold block">Tasa IVA</span>
        <input type="number" step="0.01" value={iva} onChange={(e) => setIva(e.target.value)} className="w-24 px-2 py-1.5 rounded-lg border-2 border-slate-200" /></label>
      <label className="text-sm"><span className="text-[11px] text-ink-mute font-bold block">Tasa PPM</span>
        <input type="number" step="0.001" value={ppm} onChange={(e) => setPpm(e.target.value)} className="w-24 px-2 py-1.5 rounded-lg border-2 border-slate-200" /></label>
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-cartel text-white font-black disabled:opacity-60">{saving ? '…' : 'Guardar'}</button>
      {err && <span className="text-cartel text-sm">{err}</span>}
    </div>
  );
}
