import { useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api.js';
import PeriodNav from '../components/PeriodNav.jsx';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const METODO = { EFECTIVO: '💵 Efectivo', POS: '💳 Tarjeta', TRANSFERENCIA: '📲 Transf.' };
const fecha = (iso) => { try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const TABS = [['', 'Todos'], ['INGRESO', 'Ingresos'], ['EGRESO', 'Egresos']];

// Vista de Movimientos: libro unificado de ingresos (ventas) y egresos (gastos)
// con KPIs de balance/ventas/gastos, filtro de periodo, búsqueda y descarga.
export default function Movimientos({ period: extPeriod } = {}) {
  const [localPeriod, setPeriod] = useState(null);
  const period = extPeriod || localPeriod;
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  async function load() {
    if (!period) return;
    setError('');
    const p = new URLSearchParams({ from: period.from, to: period.to });
    if (tab) p.set('type', tab);
    if (q.trim()) p.set('q', q.trim());
    try { setData(await api(`/reports/movements?${p}`)); }
    catch (e) { setError(e.message === 'PERMISO_DENEGADO' ? 'No tienes permiso para ver movimientos.' : e.message); }
  }
  useEffect(() => { setData(null); load(); }, [period, tab]);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);

  async function descargar() {
    if (!period) return;
    setDownloading(true);
    try {
      const tipo = tab === 'INGRESO' ? 'ventas' : 'movimientos';
      await apiDownload(`/reports/export?type=${tipo}&from=${period.from}&to=${period.to}`,
        `${tipo}_${period.from.slice(0, 10)}.csv`);
    } catch (e) { setError(e.message); } finally { setDownloading(false); }
  }

  const k = data?.kpis;

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">Movimientos</h2>
        <button onClick={descargar} disabled={downloading}
          className="px-4 py-2 rounded-xl bg-ink text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
          <span>⤓</span> {downloading ? 'Generando…' : 'Descargar reporte'}
        </button>
      </div>
      {error && <p className="text-cartel font-semibold">{error}</p>}

      {!extPeriod && <PeriodNav onChange={setPeriod} />}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPI label="Balance" value={money(k?.balance)} accent={k && k.balance < 0 ? 'text-red-600' : 'text-emerald-600'} icon="📈" />
        <KPI label="Ventas totales" value={money(k?.ventas.total)} sub={`${k?.ventas.n || 0} ventas`} accent="text-emerald-600" icon="🟢" />
        <KPI label="Gastos totales" value={money(k?.gastos.total)} sub={`${k?.gastos.n || 0} gastos`} accent="text-red-500" icon="🔴" />
      </div>

      {/* Tabs + búsqueda */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-lg font-bold text-sm ${tab === id ? 'bg-cartel text-white' : 'text-zinc-600'}`}>{label}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar concepto…"
          className="px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-sm flex-1 min-w-[180px]" />
      </div>

      {/* Lista */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-ink-mute border-b">
              <th className="p-3">Concepto</th><th className="text-right">Valor</th><th>Medio de pago</th><th>Fecha y hora</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((m) => (
              <tr key={m.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3 max-w-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg grid place-items-center text-xs shrink-0 ${m.tipo === 'INGRESO' ? 'bg-emerald-100' : 'bg-red-100'}`}>{m.tipo === 'INGRESO' ? '🟢' : '🔴'}</span>
                    <div className="min-w-0"><div className="truncate font-medium">{m.concepto}</div>{m.categoria && <div className="text-xs text-ink-mute">{m.categoria}</div>}</div>
                  </div>
                </td>
                <td className={`text-right font-bold tabular-nums whitespace-nowrap ${m.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-red-500'}`}>
                  {m.tipo === 'INGRESO' ? '+' : '−'}{money(m.valor)}
                </td>
                <td className="whitespace-nowrap text-xs">{METODO[m.medio_pago] || m.medio_pago}</td>
                <td className="whitespace-nowrap text-ink-mute">{fecha(m.fecha)}</td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan="4" className="p-4 text-center text-ink-mute">Sin movimientos en el período.</td></tr>}
            {!data && <tr><td colSpan="4" className="p-4 text-center text-ink-mute">Cargando…</td></tr>}
          </tbody>
        </table>
      </div>
      {data?.truncated && <p className="text-xs text-ink-mute px-2">Mostrando los más recientes. Acota el período para ver todo, o descarga el reporte completo.</p>}
    </div>
  );
}

function KPI({ label, value, sub, accent = 'text-ink', icon }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div>
        <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
        <div className={`text-xl font-black ${accent}`}>{value}</div>
        {sub && <div className="text-xs text-ink-mute">{sub}</div>}
      </div>
    </div>
  );
}
