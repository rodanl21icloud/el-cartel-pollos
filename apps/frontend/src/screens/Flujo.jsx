import { useEffect, useState, useCallback } from 'react';
import { api, apiDownload } from '../lib/api.js';
import PeriodNav from '../components/PeriodNav.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/ui/States.jsx';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// ¿El período no tiene ningún movimiento de caja? (sin ingresos ni egresos)
const sinMovimientos = (d) =>
  !d || ((!d.por_dia || d.por_dia.length === 0) && Number(d.total_ingresos) === 0 && Number(d.total_egresos) === 0);

// Flujo de caja de TODO el dinero (efectivo + POS + transferencia).
// Acceso por permiso `reports.view` (lo gobierna App.jsx).
export default function Flujo({ period: extPeriod } = {}) {
  const [localPeriod, setPeriod] = useState(null);
  const period = extPeriod || localPeriod;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState('');

  // Carga el flujo del período actual. Reutilizable por el botón "Reintentar".
  const load = useCallback(() => {
    if (!period) return;
    setLoading(true); setError(null);
    const p = new URLSearchParams({ from: period.from, to: period.to });
    api(`/reports/cash-flow?${p}`)
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(() => { load(); }, [load]);

  async function descargar() {
    if (!period) return;
    setDownloading(true); setDlError('');
    try { await apiDownload(`/reports/export?type=flujo&from=${period.from}&to=${period.to}`, `flujo_caja_${period.from.slice(0, 10)}.csv`); }
    catch { setDlError('No se pudo generar el reporte. Intenta nuevamente.'); }
    finally { setDownloading(false); }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">Flujo de caja</h2>
        <div className="flex flex-col items-end gap-1">
          <button onClick={descargar} disabled={downloading || loading || !data || sinMovimientos(data)}
            className="px-4 py-2 rounded-xl bg-ink text-white font-bold text-sm flex items-center gap-1.5 disabled:opacity-50">
            <span>⤓</span> {downloading ? 'Generando…' : 'Descargar reporte'}
          </button>
          {dlError && <span className="text-xs text-red-600">{dlError}</span>}
        </div>
      </div>

      {!extPeriod && <PeriodNav onChange={setPeriod} />}

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading || !data ? (
        <Spinner label="Cargando flujo de caja…" />
      ) : sinMovimientos(data) ? (
        <EmptyState icon="📈" title="Sin movimientos en este período"
          hint="No hubo ingresos ni egresos en las fechas seleccionadas. Prueba con otro período." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card label="Ingresos" value={data.total_ingresos} color="text-green-600" />
            <Card label="Egresos" value={data.total_egresos} color="text-red-600" />
            <Card label="Neto" value={data.neto} color={data.neto >= 0 ? 'text-green-700' : 'text-red-700'} />
          </div>

          <div className="bg-white rounded-2xl p-4 shadow">
            <h2 className="font-black text-lg mb-3">Movimiento diario</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 border-b">
                    <th className="py-2">Día</th><th className="text-right">Ingresos</th><th className="text-right">Egresos</th><th className="text-right">Neto</th><th className="text-right">Saldo acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_dia.map((d) => (
                    <tr key={d.dia} className="border-b last:border-0">
                      <td className="py-2 font-semibold">{d.dia}</td>
                      <td className="text-right text-green-600">{money(d.ingresos)}</td>
                      <td className="text-right text-red-600">{money(d.egresos)}</td>
                      <td className={`text-right font-bold ${d.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>{money(d.neto)}</td>
                      <td className="text-right font-black">{money(d.saldo_acumulado)}</td>
                    </tr>
                  ))}
                  {!data.por_dia.length && <tr><td colSpan="5" className="py-3 text-zinc-400">Sin movimientos en el período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow">
            <h2 className="font-black text-lg mb-3">Egresos por categoría</h2>
            <ul className="space-y-1 text-sm">
              {data.egresos_por_categoria.map((c) => (
                <li key={c.categoria} className="flex justify-between">
                  <span>{c.categoria} {c.kind === 'RETIRO' && <span className="text-xs text-zinc-400">(retiro)</span>}</span>
                  <span className="font-bold">{money(c.monto)}</span>
                </li>
              ))}
              {!data.egresos_por_categoria.length && <li className="text-zinc-400">Sin egresos.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow text-center">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-black ${color}`}>{money(value)}</div>
    </div>
  );
}
