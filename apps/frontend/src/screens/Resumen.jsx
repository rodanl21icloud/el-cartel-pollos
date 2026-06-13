import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { KpiCard } from '../components/ui/kit.jsx';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

// Períodos compartidos (mismo criterio en todas las vistas).
const PERIODOS = [{ id: 'dia', label: 'Día' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mes' }, { id: 'anio', label: 'Año' }, { id: 'custom', label: 'Personalizado' }];
function rangoFechas(id, cFrom, cTo) {
  const to = new Date();
  let from = new Date(); from.setHours(0, 0, 0, 0);
  if (id === 'semana') from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  else if (id === 'mes') from.setDate(1);
  else if (id === 'anio') from.setMonth(0, 1);
  else if (id === 'custom') {
    if (!cFrom || !cTo) return null;
    return { from: new Date(cFrom + 'T00:00:00').toISOString(), to: new Date(cTo + 'T23:59:59').toISOString() };
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function Resumen({ period: extPeriod } = {}) {
  const [data, setData] = useState(null);
  const [per, setPer] = useState('mes');
  const [cFrom, setCFrom] = useState(''); const [cTo, setCTo] = useState('');
  const [error, setError] = useState('');

  // Rango efectivo: el del panel principal (verde) si viene, si no el propio.
  const range = extPeriod || rangoFechas(per, cFrom, cTo);
  useEffect(() => {
    setData(null); setError('');
    if (!range) return;
    api(`/reports/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`).then(setData).catch((e) => setError(e.message));
  }, [range?.from, range?.to]);

  const customIncompleto = per === 'custom' && (!cFrom || !cTo);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">Resumen ejecutivo</h2>
        <div className="flex flex-col items-end gap-2" style={extPeriod ? { display: 'none' } : undefined}>
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-card flex-wrap">
            {PERIODOS.map((p) => <button key={p.id} onClick={() => setPer(p.id)} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${per === p.id ? 'bg-cartel text-white' : 'text-ink-mute'}`}>{p.label}</button>)}
          </div>
          {per === 'custom' && (
            <div className="flex gap-2">
              <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border-2 border-slate-200 text-sm" />
              <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} className="px-2 py-1.5 rounded-lg border-2 border-slate-200 text-sm" />
            </div>
          )}
        </div>
      </div>

      <ConsumoCard from={range?.from} to={range?.to} />

      {error ? <p className="text-cartel text-center mt-10">{error === 'PERMISO_DENEGADO' ? 'Sin permiso para ver reportes.' : error}</p>
        : customIncompleto ? <p className="text-ink-mute text-center mt-10">Elige las fechas para ver el resumen.</p>
          : !data ? <p className="text-ink-mute text-center mt-10">Cargando resumen…</p>
            : <ResumenBody data={data} />}
    </div>
  );
}

function ResumenBody({ data }) {
  const k = data.kpis;
  const maxMes = Math.max(1, ...data.tendencia.map((m) => m.ventas));
  const maxDow = Math.max(1, ...data.dias_semana.map((d) => d.monto));
  const maxTop = Math.max(1, ...data.top_productos.map((p) => p.monto));

  return (
    <>
      {/* KPIs con comparación */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Ventas" value={money(k.ventas)} delta={k.ventas_delta} />
        <KPI label="Utilidad" value={money(k.utilidad)} delta={k.utilidad_delta} />
        <KPI label="Ticket prom." value={money(k.ticket)} delta={k.ticket_delta} />
        <KPI label="N° ventas" value={k.n_ventas} delta={k.n_ventas_delta} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Gastos" value={money(k.gastos)} delta={k.gastos_delta} invert />
        <KPI label="Food cost" value={k.food_cost + '%'} hint="insumos / ventas" />
        <div className="card p-4 col-span-2 flex items-center gap-3">
          <div className="text-2xl">{data.alertas.stock_bajo.length ? '⚠️' : '✅'}</div>
          <div className="text-sm">
            <div className="font-bold">{data.alertas.stock_bajo.length ? `${data.alertas.stock_bajo.length} insumo(s) con stock bajo` : 'Inventario OK'}</div>
            {data.alertas.stock_bajo.length > 0 && <div className="text-ink-mute text-xs truncate">{data.alertas.stock_bajo.join(', ')}</div>}
          </div>
        </div>
      </div>

      {/* Tendencia mensual */}
      <div className="card p-4">
        <h3 className="font-black mb-3">Tendencia mensual (ventas vs utilidad)</h3>
        <div className="flex items-end gap-2 h-44">
          {data.tendencia.map((m) => (
            <div key={m.mes} className="flex-1 h-full flex flex-col items-center justify-end group">
              <div className="w-full flex items-end gap-0.5 justify-center" style={{ height: '100%' }}>
                <div className="w-1/2 bg-cartel/80 rounded-t" style={{ height: `${(m.ventas / maxMes) * 100}%` }} title={`Ventas ${money(m.ventas)}`} />
                <div className="w-1/2 bg-emerald-500/80 rounded-t" style={{ height: `${(Math.max(0, m.utilidad) / maxMes) * 100}%` }} title={`Utilidad ${money(m.utilidad)}`} />
              </div>
              <span className="text-[9px] text-ink-mute mt-1">{m.mes.slice(5)}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-xs text-ink-mute mt-2"><span className="flex items-center gap-1"><span className="w-3 h-3 bg-cartel/80 rounded-sm" /> Ventas</span><span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500/80 rounded-sm" /> Utilidad</span></div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Top productos */}
        <div className="card p-4">
          <h3 className="font-black mb-3">Más vendidos (monto)</h3>
          <ul className="space-y-2">
            {data.top_productos.map((p) => (
              <li key={p.name}>
                <div className="flex justify-between text-sm"><span className="font-semibold truncate pr-2">{p.name}</span><span className="text-ink-mute whitespace-nowrap">{p.unidades}u · {money(p.monto)}</span></div>
                <div className="h-1.5 bg-slate-100 rounded-full mt-0.5"><div className="h-1.5 bg-cartel rounded-full" style={{ width: `${(p.monto / maxTop) * 100}%` }} /></div>
              </li>
            ))}
            {!data.top_productos.length && <li className="text-ink-mute">Sin datos.</li>}
          </ul>
        </div>

        {/* Ventas por día de semana */}
        <div className="card p-4">
          <h3 className="font-black mb-3">Ventas por día de la semana</h3>
          <div className="flex items-end gap-2 h-32">
            {data.dias_semana.map((d) => (
              <div key={d.dia} className="flex-1 h-full flex flex-col items-center justify-end">
                <div className="w-full bg-ink/80 rounded-t" style={{ height: `${(d.monto / maxDow) * 100}%` }} title={money(d.monto)} />
                <span className="text-[10px] text-ink-mute mt-1">{d.dia}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Productos con menor margen — decisión de precio */}
      <div className="card p-4">
        <h3 className="font-black mb-1">Productos con menor margen</h3>
        <p className="text-xs text-ink-mute mb-3">Candidatos a subir precio o revisar costo/receta.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead><tr className="text-left text-ink-mute border-b"><th className="py-2">Producto</th><th className="text-right">Precio</th><th className="text-right">Costo</th><th className="text-right">Margen</th></tr></thead>
            <tbody>
              {data.peores_margen.map((p) => (
                <tr key={p.name} className="border-b last:border-0">
                  <td className="py-2 font-semibold">{p.name}</td>
                  <td className="text-right">{money(p.price)}</td>
                  <td className="text-right text-ink-mute">{money(p.costo)}</td>
                  <td className={`text-right font-bold ${p.margen >= 50 ? 'text-emerald-600' : p.margen >= 35 ? 'text-amber-600' : 'text-cartel'}`}>{p.margen}%</td>
                </tr>
              ))}
              {!data.peores_margen.length && <tr><td colSpan="4" className="py-3 text-ink-mute">Carga recetas para ver márgenes.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// Consumo del período (pollos vendidos por receta + papas en kg).
// Sigue el rango del panel principal (verde): sin selector propio.
function ConsumoCard({ from, to }) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => {
    setErr(''); setD(null);
    if (!from || !to) return;
    api(`/reports/consumo-insumos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then(setD).catch((e) => setErr(e.message));
  }, [from, to]);
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h3 className="font-black">Consumo del período</h3>
      </div>
      {err ? <p className="text-cartel text-sm">{err}</p>
        : !from || !to ? <p className="text-ink-mute text-sm">Elige las fechas.</p>
          : !d ? <p className="text-ink-mute text-sm">Cargando…</p>
            : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-cartel/5 p-4 text-center">
                  <div className="text-4xl font-black text-cartel tabular-nums">🍗 {d.pollos}</div>
                  <div className="text-xs text-ink-mute font-bold mt-1">pollos vendidos</div>
                </div>
                <div className="rounded-xl bg-amber-50 p-4 text-center">
                  <div className="text-4xl font-black tabular-nums" style={{ color: '#f5a623' }}>🥔 {d.papas_kg}</div>
                  <div className="text-xs text-ink-mute font-bold mt-1">kg de papa</div>
                </div>
              </div>
            )}
    </div>
  );
}

function KPI({ label, value, delta, hint, invert }) {
  return <KpiCard label={label} value={value} delta={delta} invert={invert} hint={hint} />;
}
