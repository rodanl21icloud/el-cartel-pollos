import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, ErrorState, EmptyState } from '../components/ui/States.jsx';
import { KpiCard, Delta as KitDelta } from '../components/ui/kit.jsx';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fechaCorta = (iso) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }); } catch { return ''; } };

// Selector de período (mismo criterio que el resto de la app).
const PERIODOS = [{ id: 'dia', label: 'Hoy' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mes' }, { id: 'anio', label: 'Año' }, { id: 'custom', label: 'Personalizado' }];
function rango(id, cFrom, cTo) {
  const to = new Date(); let from = new Date(); from.setHours(0, 0, 0, 0);
  if (id === 'semana') from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  else if (id === 'mes') from.setDate(1);
  else if (id === 'anio') from.setMonth(0, 1);
  else if (id === 'custom') { if (!cFrom || !cTo) return null; return { from: new Date(cFrom + 'T00:00:00').toISOString(), to: new Date(cTo + 'T23:59:59').toISOString() }; }
  return { from: from.toISOString(), to: to.toISOString() };
}
const TABS = [{ id: 'ventas', label: 'Ventas' }, { id: 'gastos', label: 'Gastos' }, { id: 'propinas', label: 'Propinas' }, { id: 'empleados', label: 'Empleados' }];

export default function Estadisticas({ period: extPeriod } = {}) {
  const [tab, setTab] = useState('ventas');
  const [per, setPer] = useState('dia');
  const [cFrom, setCFrom] = useState(''); const [cTo, setCTo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const r = useMemo(() => extPeriod || rango(per, cFrom, cTo), [per, cFrom, cTo, extPeriod]);
  const premium = tab === 'propinas' || tab === 'empleados';

  useEffect(() => {
    if (premium) return;
    if (!r) { setData(null); return; }
    setData(null); setError(null);
    api(`/reports/estadisticas/${tab}?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`).then(setData).catch(setError);
  }, [tab, r, premium]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">Estadísticas</h2>
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

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-card overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap ${tab === t.id ? 'bg-cartel text-white' : 'text-ink-mute'}`}>
            {t.label}{(t.id === 'propinas' || t.id === 'empleados') && ' ✨'}
          </button>
        ))}
      </div>

      {premium ? <Premium tab={tab} />
        : per === 'custom' && !r ? <p className="text-ink-mute text-center mt-10">Elige las fechas.</p>
          : error ? <ErrorState error={error} onRetry={() => setPer((p) => p)} />
            : !data ? <Spinner label="Cargando estadísticas…" />
              : tab === 'ventas' ? <Ventas d={data} /> : <Gastos d={data} />}
    </div>
  );
}

// Wrappers que delegan al kit canónico (consistencia visual del sistema).
function Delta({ v, invert }) { return <KitDelta value={v} invert={invert} />; }
function Kpi({ label, value, v, invert, note, big }) {
  return <KpiCard label={label} value={value} delta={v} invert={invert} hint={note} big={big} />;
}
function Chips({ items }) {
  if (!items?.length) return null;
  return <div className="flex flex-wrap gap-2">{items.map((t, i) => <span key={i} className="text-sm bg-cartel/5 border border-cartel/20 text-ink rounded-full px-3 py-1.5 font-semibold">💡 {t}</span>)}</div>;
}
function csv(name, header, rows) {
  const esc = (s) => { s = String(s ?? ''); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.csv'; a.click();
}

function Ventas({ d }) {
  const k = d.kpis;
  const horas = d.serie.filter((s) => s.actual > 0 || s.comparativo > 0);
  const maxH = Math.max(1, ...d.serie.map((s) => Math.max(s.actual, s.comparativo)));
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-mute">{d.comparativo.etiqueta}</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Kpi label="Total ventas" value={money(k.total_ventas.valor)} v={k.total_ventas.var} big />
        <Kpi label="Ganancia de las ventas" value={money(k.ganancia.valor)} v={k.ganancia.var} note={k.ganancia.nota} big />
        <Kpi label="Margen" value={k.margen_pct.valor != null ? k.margen_pct.valor + '%' : '—'} note={d.costos_incompletos ? 'estimado (faltan costos)' : 'ganancia / ventas'} />
        <Kpi label="Ticket promedio" value={money(k.ticket.valor)} v={k.ticket.var} />
        <Kpi label="N° pedidos" value={k.pedidos.valor} v={k.pedidos.var} />
        <Kpi label="Descuentos" value={money(k.descuentos.valor)} v={k.descuentos.var} invert />
      </div>

      <Chips items={d.insights} />

      {/* Detalle de ventas (hora actual vs comparativo) */}
      <div className="card p-4">
        <h3 className="font-black mb-1">Detalle de ventas</h3>
        <div className="flex gap-4 text-xs text-ink-mute mb-3">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-cartel rounded-sm" /> Actual</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-300 rounded-sm" /> Período anterior</span>
        </div>
        {!horas.length ? <EmptyState icon="📊" title="Sin ventas en el período" /> : (
          <div className="flex items-end gap-1 h-44 overflow-x-auto">
            {horas.map((s) => (
              <div key={s.hora} className="flex-1 min-w-[14px] h-full flex flex-col items-center justify-end" title={`${String(s.hora).padStart(2, '0')}:00 · Actual ${money(s.actual)} · Anterior ${money(s.comparativo)}`}>
                <div className="w-full flex-1 flex items-end gap-0.5 justify-center">
                  <div className="w-1/2 bg-cartel rounded-t" style={{ height: `${(s.actual / maxH) * 100}%` }} />
                  <div className="w-1/2 bg-slate-300 rounded-t" style={{ height: `${(s.comparativo / maxH) * 100}%` }} />
                </div>
                <span className="text-[9px] text-ink-mute mt-1">{s.hora}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ranking de productos */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black">Detalle de productos vendidos</h3>
          <button onClick={() => csv('productos', ['Producto', 'Categoría', 'Total ventas', 'Unidades', 'Margen %', 'Participación %'], d.productos.map((p) => [p.name, p.category, Math.round(p.total_ventas), p.unidades, p.margen_pct ?? '', p.participacion_pct]))}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-700">Exportar CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-ink-mute border-b"><th className="py-2">Producto</th><th className="text-right">Total ventas</th><th className="text-right">Unid.</th><th className="text-right">Margen</th><th className="text-right">Part.</th><th className="text-right">vs ant.</th></tr></thead>
            <tbody>
              {d.productos.map((p, i) => (
                <tr key={p.name} className={`border-b last:border-0 ${i === 0 ? 'bg-amber-50' : ''}`}>
                  <td className="py-2 font-semibold">{i === 0 && '⭐ '}{p.name}<span className="block text-[11px] text-ink-mute">{p.category}</span></td>
                  <td className="text-right font-bold tabular-nums">{money(p.total_ventas)}</td>
                  <td className="text-right tabular-nums">{p.unidades}</td>
                  <td className={`text-right tabular-nums ${p.margen_pct != null && p.margen_pct < 25 ? 'text-cartel font-bold' : ''}`}>{p.margen_pct != null ? p.margen_pct + '%' : '—'}</td>
                  <td className="text-right text-ink-mute tabular-nums">{p.participacion_pct}%</td>
                  <td className="text-right tabular-nums"><Delta v={p.variacion_pct} /></td>
                </tr>
              ))}
              {!d.productos.length && <tr><td colSpan="6" className="py-3 text-ink-mute">Sin productos vendidos.</td></tr>}
            </tbody>
          </table>
        </div>
        {d.productos.length > 0 && <p className="text-[11px] text-ink-mute mt-2">⭐ Producto estrella · margen rojo = baja rentabilidad. La ganancia se calcula según el costo de tus productos.</p>}
      </div>
    </div>
  );
}

function Gastos({ d }) {
  const k = d.kpis;
  const maxC = Math.max(1, ...d.breakdown.map((b) => b.total));
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-mute">{d.comparativo.etiqueta}</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total gastos" value={money(k.total.valor)} v={k.total.var} invert big />
        <Kpi label="Movimientos" value={k.movimientos} note="gastos registrados" />
        <Kpi label="Promedio diario" value={money(k.prom_diario)} note="por día con gasto" />
        <Kpi label="% sobre ventas" value={k.pct_sobre_ventas != null ? k.pct_sobre_ventas + '%' : '—'} note="gastos / ventas" />
      </div>

      <Chips items={d.insights} />

      <div className="card p-4">
        <h3 className="font-black mb-3">Detalle de gastos por categoría</h3>
        {!d.breakdown.length ? <EmptyState icon="💸" title="Sin gastos en el período" /> : d.breakdown.map((b) => (
          <div key={b.categoria} className="mb-2">
            <div className="flex justify-between text-sm"><span className="font-semibold">{b.categoria}{b.kind === 'RETIRO' && <span className="text-[11px] text-ink-mute"> · retiro</span>}</span><span className="text-ink-mute">{b.pct}% · {money(b.total)} <Delta v={b.variacion_pct} invert /></span></div>
            <div className="h-2 bg-slate-100 rounded-full mt-0.5"><div className="h-2 bg-cartel rounded-full" style={{ width: `${(b.total / maxC) * 100}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black">Detalle de gastos</h3>
          <button onClick={() => csv('gastos', ['Fecha', 'Categoría', 'Proveedor', 'Descripción', 'Método', 'Monto'], d.detalle.map((g) => [fechaCorta(g.fecha), g.categoria, g.proveedor || '', g.descripcion, g.payment_method, Math.round(g.amount)]))}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-100 text-zinc-700">Exportar CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-ink-mute border-b"><th className="py-2">Fecha</th><th>Categoría</th><th>Descripción</th><th>Método</th><th className="text-right">Monto</th></tr></thead>
            <tbody>
              {d.detalle.map((g, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 whitespace-nowrap">{fechaCorta(g.fecha)}</td>
                  <td>{g.categoria}</td>
                  <td className="max-w-[180px] truncate">{g.descripcion}{g.proveedor ? <span className="block text-[11px] text-ink-mute">{g.proveedor}</span> : null}</td>
                  <td>{g.payment_method}</td>
                  <td className="text-right font-bold tabular-nums">{money(g.amount)}</td>
                </tr>
              ))}
              {!d.detalle.length && <tr><td colSpan="5" className="py-3 text-ink-mute">Sin gastos.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Premium({ tab }) {
  const t = tab === 'propinas'
    ? { icon: '💵', title: 'Propinas', hint: 'Análisis de propinas por turno, empleado y canal.' }
    : { icon: '👥', title: 'Empleados', hint: 'Productividad, ticket promedio y desempeño por turno.' };
  return (
    <div className="card p-8 text-center">
      <div className="inline-block text-xs font-black bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-3 py-1 mb-3">✨ Función premium</div>
      <div className="text-5xl mb-2">{t.icon}</div>
      <h3 className="text-xl font-black mb-1">{t.title}</h3>
      <p className="text-ink-mute max-w-md mx-auto">{t.hint}</p>
      <p className="text-xs text-ink-mute mt-3">Requiere registrar propinas y turnos del equipo (próxima fase).</p>
    </div>
  );
}
