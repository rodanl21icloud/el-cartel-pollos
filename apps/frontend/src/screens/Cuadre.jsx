import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, ErrorState, EmptyState } from '../components/ui/States.jsx';
import { PageHeader, KpiCard, Badge } from '../components/ui/kit.jsx';

// Cuadre operativo de turno: conteo de pollos/papas en apertura vs cierre.
// NO refleja inventario real; detecta descalces y merma excesiva.
const ESTADO = {
  OK: { tone: 'ok', txt: 'OK' },
  INCONSISTENCIA: { tone: 'warn', txt: 'Inconsistencia' },
  PERDIDA_EXCESIVA: { tone: 'bad', txt: 'Pérdida excesiva' },
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
      <PageHeader title="Cuadre de turno" subtitle={`Conteo de pollos y papas (apertura vs cierre). No altera el inventario. Umbral de alerta: ${data.umbral}.`} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Turnos" value={r.turnos} />
        <KpiCard label="Con alerta" value={r.con_alerta} alert={r.con_alerta > 0} />
        <KpiCard label="Merma total (pollos)" value={r.merma_total} />
        <KpiCard label="Descalce total" value={r.descalce_total} alert={r.descalce_total > 0} />
      </div>

      <div className="space-y-3">
        {data.turnos.map((t) => {
          const e = ESTADO[t.estado] || ESTADO.OK;
          return (
            <div key={t.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-black">{fecha(t.closed_at)}</div>
                  <div className="text-xs text-ink-mute">Encargado: {t.encargado}</div>
                </div>
                <Badge tone={e.tone}>{e.txt}</Badge>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-sm">
                <Cell label="Horno" v={t.pollos_horno} />
                <Cell label="Crudos ini" v={t.pollos_crudos_ini} />
                <Cell label="Merma" v={t.merma_pollos} />
                <Cell label="Crudos fin" v={t.pollos_crudos_fin} />
                <Cell label="Esperado" v={t.esperado_final} />
                <Cell label="Descalce" v={t.descalce} alert={t.descalce !== 0} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-sm mt-2 text-ink-mute">
                <Cell label="Papas ini" v={t.sacos_papas_ini} />
                <Cell label="Papas fin" v={t.sacos_papas_fin} />
                <Cell label="Variación papas" v={t.variacion_papas} />
              </div>
              {(t.obs_apertura || t.obs_cierre) && (
                <div className="text-xs text-ink-mute mt-2 space-y-0.5">
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

function Cell({ label, v, alert }) {
  return (
    <div>
      <div className="text-[11px] text-ink-mute">{label}</div>
      <div className={`font-bold tabular-nums ${alert ? 'text-cartel' : ''}`}>{v}</div>
    </div>
  );
}
