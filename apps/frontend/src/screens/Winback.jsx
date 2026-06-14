import { useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, EmptyState, ErrorState } from '../components/ui/States.jsx';

// Panel interno (gerencia): genera borradores de recuperación de clientes
// dormidos y permite enviarlos por WhatsApp con un clic. No envía solo.
export default function Winback() {
  const [state, setState] = useState('idle'); // idle | loading | ready | error
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  async function generar() {
    setState('loading'); setError(null);
    try { setData(await api('/marketing/winback')); setState('ready'); }
    catch (e) { setError(e); setState('error'); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-black text-xl">Recuperar clientes</h2>
          <p className="text-sm text-ink-mute">Clientes sin comprar hace 15–60 días. Revisa cada mensaje y envíalo por WhatsApp.</p>
        </div>
        <button onClick={generar} disabled={state === 'loading'}
          className="px-4 py-2 rounded-xl bg-cartel text-white font-bold disabled:opacity-50">
          {state === 'loading' ? 'Generando…' : '✨ Generar mensajes'}
        </button>
      </div>

      {state === 'idle' && (
        <EmptyState icon="📣" title="Sin borradores aún"
          hint="Toca “Generar mensajes” para redactar invitaciones de regreso con IA." />
      )}
      {state === 'loading' && <Spinner label="Redactando mensajes…" />}
      {state === 'error' && <ErrorState error={error} onRetry={generar} />}

      {state === 'ready' && (data.count === 0 ? (
        <EmptyState icon="🎉" title="No hay clientes dormidos"
          hint="Todos tus clientes han comprado hace poco. ¡Buen trabajo!" />
      ) : (
        <>
          <div className="text-xs text-ink-mute px-1">
            {data.count} cliente(s) · fuente: <b>{data.model}</b>
          </div>
          <ul className="space-y-2">
            {data.drafts.map((d) => (
              <li key={d.client_id} className="bg-white rounded-2xl shadow p-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="font-bold">{d.name}
                    <span className="text-xs font-normal text-ink-mute"> · {d.days_since} días sin comprar
                      {d.favorite ? ` · ❤ ${d.favorite}` : ''}</span>
                  </div>
                  {!d.ai && <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">plantilla</span>}
                </div>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">{d.message}</p>
                <a href={d.whatsapp_url} target="_blank" rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white font-bold text-sm">
                  📲 Enviar por WhatsApp
                </a>
              </li>
            ))}
          </ul>
        </>
      ))}
    </div>
  );
}
