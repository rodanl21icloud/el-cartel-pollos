import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const pct = (n) => `${n}%`;

// Estado de Resultados (P&L). Solo gerencia.
export default function Pnl({ role }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (role !== 'GERENCIA') return;
    api('/reports/pnl').then(setData).catch((e) => setError(e.message));
  }, [role]);

  if (role !== 'GERENCIA') return <p className="text-zinc-500 text-center mt-10">Solo la gerencia puede ver el P&L.</p>;
  if (error) return <p className="text-red-600 text-center mt-10">{error}</p>;
  if (!data) return <p className="text-zinc-500 text-center mt-10">Cargando estado de resultados…</p>;

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
    <div className="max-w-xl mx-auto space-y-4">
      {/* Tarjeta destacada de utilidad */}
      <div className="grid grid-cols-3 gap-3">
        <KPI label="Food cost" value={pct(m.food_cost_pct)} hint="insumos / ventas" tone={m.food_cost_pct <= 35 ? 'good' : 'warn'} />
        <KPI label="Utilidad bruta" value={pct(m.utilidad_bruta_pct)} hint={money(data.utilidad_bruta)} tone="neutral" />
        <KPI label="Utilidad operativa" value={pct(m.utilidad_operativa_pct)} hint={money(data.utilidad_operativa)} tone={data.utilidad_operativa >= 0 ? 'good' : 'bad'} />
      </div>

      {/* Estado de resultados */}
      <div className="bg-white rounded-2xl p-5 shadow">
        <h2 className="font-black text-xl mb-1">Estado de Resultados</h2>
        <p className="text-xs text-zinc-400 mb-4">Últimos 12 meses · {data.period.from.slice(0, 10)} → {data.period.to.slice(0, 10)}</p>

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

      <p className="text-xs text-zinc-400 px-2">
        El costo de insumos usa el costo congelado al momento de cada venta (BOM). Los retiros de
        socios no son gasto operativo: son distribución de utilidades, por eso van aparte.
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
