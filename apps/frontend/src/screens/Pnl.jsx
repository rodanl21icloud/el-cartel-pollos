import { useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api.js';
import PeriodNav from '../components/PeriodNav.jsx';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const pct = (n) => `${n}%`;

// Estado de Resultados (P&L). Solo gerencia.
export default function Pnl({ role }) {
  const [period, setPeriod] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (role !== 'GERENCIA' || !period) return;
    setData(null); setError('');
    const p = new URLSearchParams({ from: period.from, to: period.to });
    api(`/reports/pnl?${p}`).then(setData).catch((e) => setError(e.message));
  }, [role, period]);

  async function descargar() {
    if (!period) return;
    setDownloading(true);
    try { await apiDownload(`/reports/export?type=pnl&from=${period.from}&to=${period.to}`, `estado_resultados_${period.from.slice(0, 10)}.csv`); }
    catch (e) { setError(e.message); } finally { setDownloading(false); }
  }

  if (role !== 'GERENCIA') return <p className="text-zinc-500 text-center mt-10">Solo la gerencia puede ver el P&L.</p>;
  if (error) return <p className="text-red-600 text-center mt-10">{error}</p>;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">P&amp;L</h2>
        <button onClick={descargar} disabled={downloading || !data}
          className="px-4 py-2 rounded-xl bg-ink text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
          <span>⤓</span> {downloading ? 'Generando…' : 'Descargar reporte'}
        </button>
      </div>
      <PeriodNav onChange={setPeriod} />
      {!data ? <p className="text-zinc-500 text-center mt-10">Cargando estado de resultados…</p> : <PnlBody data={data} />}
    </div>
  );
}

function PnlBody({ data }) {

  const m = data.margenes;
  const Line = ({ label, value, pctVal, bold, neg, sub }) => (
    <div className={`flex justify-between items-baseline py-2 ${bold ? 'border-t-2 border-zinc-300' : 'border-b border-zinc-100'} ${sub ? 'pl-4 text-sm text-zinc-500' : ''}`}>
      <span className={bold ? 'font-black' : 'font-semibold text-zinc-700'}>{label}</span>
      <span className="flex items-baseline gap-3">
        {pctVal != null && <span className="text-xs text-zinc-400">{pct(pctVal)}</span>}
        <span className={`tabular-nums ${bold ? 'font-black text-lg' : 'font-bold'} ${neg ? 'text-red-600' : ''}`}>
          {neg ? '− ' : ''}{money(value)}
        </span>
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Tarjeta destacada de utilidad */}
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Food cost" value={pct(m.food_cost_pct)} hint="insumos / ventas" tone={m.food_cost_pct <= 35 ? 'good' : 'warn'} />
        <KPI label="Utilidad bruta" value={pct(m.utilidad_bruta_pct)} hint={money(data.utilidad_bruta)} tone="neutral" />
        <KPI label="Utilidad operativa" value={pct(m.utilidad_operativa_pct)} hint={money(data.utilidad_operativa)} tone={data.utilidad_operativa >= 0 ? 'good' : 'bad'} />
      </div>

      {/* Estado de resultados */}
      <div className="bg-white rounded-2xl p-5 shadow">
        <h2 className="font-black text-xl mb-1">Estado de Resultados</h2>
        <p className="text-xs text-zinc-400 mb-4">{data.period.from.slice(0, 10)} → {data.period.to.slice(0, 10)}</p>

        <Line label="Ventas" value={data.ventas} pctVal={100} />
        <Line label="Costo de insumos (BOM)" value={data.costo_insumos} pctVal={m.food_cost_pct} neg />
        <Line label="Utilidad bruta" value={data.utilidad_bruta} pctVal={m.utilidad_bruta_pct} bold />

        <div className="mt-3" />
        <Line label="Mermas" value={data.mermas} pctVal={m.merma_pct} neg />
        <Line label="Gastos operativos" value={data.gastos_operativos} neg />
        {data.gastos_por_categoria.map((g) => (
          <Line key={g.categoria} label={g.categoria} value={g.monto} sub />
        ))}
        <Line label="Utilidad operativa" value={data.utilidad_operativa} pctVal={m.utilidad_operativa_pct} bold />

        <div className="mt-3" />
        <Line label="Retiros de socios" value={data.retiros} neg />
        <Line label="Resultado después de retiros" value={data.utilidad_despues_retiros} bold />
      </div>

      {/* Contraste con la realidad bancaria */}
      {data.banco && (
        <div className="bg-white rounded-2xl p-5 shadow border-2 border-amber-300">
          <h2 className="font-black text-lg mb-1">⚠️ Realidad bancaria del período</h2>
          <p className="text-xs text-zinc-500 mb-3">
            Tus egresos reales (insumos/proveedores) suelen estar en el banco, no en los gastos del sistema.
            Esta es tu utilidad <b>real estimada</b>.
          </p>
          <div className="text-sm">
            <div className="flex justify-between py-1"><span>Ventas (POS)</span><b>{money(data.ventas)}</b></div>
            <div className="flex justify-between py-1"><span>− Egresos operativos reales (banco)</span><b className="text-red-600">− {money(data.banco.egresos_operativos)}</b></div>
            <div className="flex justify-between border-t mt-1 pt-2 text-lg">
              <span className="font-black">Utilidad real estimada</span>
              <b className={data.banco.utilidad_real >= 0 ? 'text-green-600' : 'text-red-600'}>{money(data.banco.utilidad_real)} ({data.banco.utilidad_real_pct}%)</b>
            </div>
          </div>
          <div className="mt-3 bg-amber-50 rounded-xl p-3 text-sm">
            <div className="flex justify-between"><span>Gastos registrados en el sistema</span><b>{money(data.gastos_operativos)}</b></div>
            <div className="flex justify-between"><span>Egresos reales según banco</span><b>{money(data.banco.egresos_operativos)}</b></div>
            {data.banco.gastos_no_registrados > 0 && (
              <div className="flex justify-between text-cartel font-bold border-t mt-1 pt-1"><span>Costo NO registrado en el sistema</span><b>{money(data.banco.gastos_no_registrados)}</b></div>
            )}
            {data.banco.retiros > 0 && <div className="flex justify-between text-zinc-500 mt-1"><span>Retiros de socios (banco)</span><span>{money(data.banco.retiros)}</span></div>}
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-400 px-2">
        El costo de insumos (BOM) usa el costo congelado al vender. La <b>utilidad real</b> usa los egresos
        del banco, que reflejan el gasto efectivo en mercadería aunque no esté registrado en el sistema.
        Los retiros de socios no son gasto operativo: van aparte.
      </p>
    </div>
  );
}

function KPI({ label, value, hint, tone }) {
  const color = tone === 'good' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600'
    : tone === 'bad' ? 'text-red-600' : 'text-zinc-800';
  return (
    <div className="bg-white rounded-2xl p-3 shadow text-center">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-[11px] text-zinc-400">{hint}</div>
    </div>
  );
}
