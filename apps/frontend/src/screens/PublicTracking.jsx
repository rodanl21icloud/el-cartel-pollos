import { useEffect, useState } from 'react';
import { BRAND_LOGO, BRAND_NAME } from '../config/brand.js';

// Página PÚBLICA de seguimiento de pedido (sin login). Link: /seguimiento/:order_number.
// Refresca el estado cada 20s mientras el pedido no esté entregado/anulado.
const STEPS = [
  { key: 'PENDIENTE', label: 'Recibido', icon: '📝' },
  { key: 'EN_PREPARACION', label: 'En preparación', icon: '🍗' },
  { key: 'LISTO', label: 'Listo', icon: '✅' },
  { key: 'ENTREGADO', label: 'Entregado', icon: '🛵' },
];

export default function PublicTracking({ orderNumber }) {
  const [data, setData] = useState(undefined); // undefined=cargando, null=error
  const load = () => fetch(`/api/public/tracking/${encodeURIComponent(orderNumber)}`)
    .then((r) => r.json()).then(setData).catch(() => setData(null));

  useEffect(() => {
    load();
    const t = setInterval(() => {
      // Deja de refrescar en estados terminales.
      setData((d) => { if (!d || ['ENTREGADO', 'ANULADA'].includes(d.status)) return d; load(); return d; });
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [orderNumber]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-ink text-white px-5 py-4 flex items-center gap-3">
        <img src={BRAND_LOGO} alt="" className="h-9 rounded-md" />
        <div className="font-black truncate">{BRAND_NAME}</div>
      </header>

      <main className="flex-1 grid place-items-center p-5">
        <div className="w-full max-w-md bg-white rounded-3xl shadow p-6 text-center">
          {data === undefined && <p className="text-slate-400 animate-pulse py-10">Buscando tu pedido…</p>}

          {data === null && <p className="text-red-600 font-semibold py-10">No pudimos cargar el estado. Intenta de nuevo.</p>}

          {data && data.found === false && (
            <div className="py-8">
              <div className="text-5xl mb-2">🔍</div>
              <h2 className="font-black text-lg">Pedido no encontrado</h2>
              <p className="text-slate-500 text-sm mt-1">Revisa el número de orden de hoy en tu comprobante.</p>
            </div>
          )}

          {data && data.found && data.status === 'ANULADA' && (
            <div className="py-8">
              <div className="text-5xl mb-2">❌</div>
              <h2 className="font-black text-lg">Pedido N° {data.order_number} anulado</h2>
              <p className="text-slate-500 text-sm mt-1">Si crees que es un error, contáctanos.</p>
            </div>
          )}

          {data && data.found && data.status !== 'ANULADA' && (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Pedido</div>
              <div className="text-5xl font-black text-cartel my-1">N° {data.order_number}</div>
              <div className="font-bold text-slate-700 mb-6">{data.label}</div>

              <ol className="space-y-3 text-left">
                {STEPS.map((s, i) => {
                  const idx = i + 1;
                  const done = idx < data.step;
                  const active = idx === data.step;
                  return (
                    <li key={s.key} className="flex items-center gap-3">
                      <span className={`grid place-items-center w-10 h-10 rounded-full text-lg shrink-0 transition
                        ${done ? 'bg-green-500 text-white' : active ? 'bg-cartel text-white animate-pulse' : 'bg-slate-200 text-slate-400'}`}>
                        {done ? '✓' : s.icon}
                      </span>
                      <span className={`font-bold ${active ? 'text-cartel' : done ? 'text-slate-700' : 'text-slate-400'}`}>{s.label}</span>
                    </li>
                  );
                })}
              </ol>

              <p className="text-[11px] text-slate-400 mt-6">Se actualiza solo. {BRAND_NAME}</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
