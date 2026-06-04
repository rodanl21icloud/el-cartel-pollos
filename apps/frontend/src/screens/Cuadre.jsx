import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, ErrorState, EmptyState } from '../components/ui/States.jsx';

// Cuadre operativo de turno: conteo de pollos/papas en apertura vs cierre.
// NO refleja inventario real; detecta descalces y merma excesiva.
const ESTADO = {
  OK: { txt: 'OK', cls: 'bg-green-100 text-green-700 border-green-300' },
  INCONSISTENCIA: { txt: 'Inconsistencia', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  PERDIDA_EXCESIVA: { txt: 'Pérdida excesiva', cls: 'bg-red-100 text-red-700 border-red-300' },
};
const fecha = (iso) => { try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; } };

export default function Cuadre() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null); setData(null);
    try { setData(await api('/reports/turnos')); } catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner label="Cargando cuadre de turno…" />;
  if (!data.turnos.length) return <EmptyState icon="🐔" title="Sin turnos cerrados" hint="El cuadre aparece al cerrar la caja con el conteo de pollos y papas." />;

  const r = data.resumen;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h2 className="text-2xl font-black">Cuadre de turno 🐔</h2>
        <p className="text-zinc-500 text-sm">Conteo de pollos y papas (apertura vs cierre). No altera el inventario. Umbral de alerta: <b>{data.umbral}</b>.</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Turnos" value={r.turnos} />
        <Kpi label="Con alerta" value={r.con_alerta} alert={r.con_alerta > 0} />
        <Kpi label="Merma total (pollos)" value={r.merma_total} />
        <Kpi label="Descalce total" value={r.descalce_total} alert={r.descalce_total > 0} />
      </div>

      {/* Lista de turnos */}
      <div className="space-y-3">
        {data.turnos.map((t) => {
          const e = ESTADO[t.estado] || ESTADO.OK;
          return (
            <div key={t.id} className="bg-white rounded-2xl shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-black">{fecha(t.closed_at)}</div>
                  <div className="text-xs text-zinc-500">Encargado: {t.encargado}</div>
                </div>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${e.cls}`}>{e.txt}</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-sm">
                <Cell label="Horno" v={t.pollos_horno} />
                <Cell label="Crudos ini" v={t.pollos_crudos_ini} />
                <Cell label="Merma" v={t.merma_pollos} />
                <Cell label="Crudos fin" v={t.pollos_crudos_fin} />
                <Cell label="Esperado" v={t.esperado_final} />
                <Cell label="Descalce" v={t.descalce} alert={t.descalce !== 0} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm mt-2 text-zinc-600">
                <Cell label="Papas ini" v={t.sacos_papas_ini} />
                <Cell label="Papas fin" v={t.sacos_papas_fin} />
                <Cell label="Variación papas" v={t.variacion_papas} />
              </div>
              {(t.obs_apertura || t.obs_cierre) && (
                <div className="text-xs text-zinc-500 mt-2 space-y-0.5">
                  {t.obs_apertura && <div>📝 Apertura: {t.obs_apertura}</div>}
                  {t.obs_cierre && <div>📝 Cierre: {t.obs_cierre}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, alert }) {
  return (
    <div className={`rounded-2xl p-3 shadow ${alert ? 'bg-red-50 border border-red-200' : 'bg-white'}`}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${alert ? 'text-red-600' : ''}`}>{value}</div>
    </div>
  );
}
function Cell({ label, v, alert }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className={`font-bold tabular-nums ${alert ? 'text-red-600' : ''}`}>{v}</div>
    </div>
  );
}
