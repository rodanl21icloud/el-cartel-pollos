import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { roleLabel } from '../config/roles.js';
import { Spinner, EmptyState, ErrorState } from '../components/ui/States.jsx';

const fecha = (iso) => { try { return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium' }); } catch { return iso; } };
const SEV = { INFO: 'bg-slate-100 text-slate-600', WARN: 'bg-amber-100 text-amber-700', ALERT: 'bg-red-100 text-red-700' };
// Etiquetas legibles para las acciones más comunes.
const ACTION_LABEL = {
  LOGIN_OK: 'Inicio de sesión', LOGIN_FAIL: 'Login fallido', SALE_SYNC: 'Venta', SALE_FREE: 'Venta libre',
  SALE_VOID: 'Anulación de venta', CASH_OPEN: 'Apertura de caja', CASH_CLOSE: 'Cierre de caja',
  STOCK_AJUSTE: 'Ajuste de stock', STOCK_PIN_REJECT: 'PIN de stock rechazado', INV_MERMA: 'Merma',
  INV_REPOSICION: 'Reposición', PERMISSION_UPDATE: 'Cambio de permiso', ADMIN_PIN_SET: 'PIN admin configurado',
  USER_CREATE: 'Usuario creado', USER_UPDATE: 'Usuario editado', USER_PASSWORD_RESET: 'Clave reseteada',
  HMAC_REJECT: 'Venta manipulada (rechazada)', PRODUCT_UPDATE: 'Producto editado', SETTINGS_UPDATE: 'Datos del negocio',
};
const label = (a) => ACTION_LABEL[a] || a;

// Auditoría / actividad: lectura del registro inmutable de eventos sensibles.
export default function Auditoria() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const [sev, setSev] = useState('');
  const [q, setQ] = useState('');

  async function load() {
    setItems(null); setError('');
    const p = new URLSearchParams({ limit: '200' });
    if (sensitive) p.set('sensitive', '1');
    if (sev) p.set('severity', sev);
    if (q.trim()) p.set('q', q.trim());
    try { setItems(await api(`/audit?${p}`)); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [sensitive, sev]);
  useEffect(() => { const t = setTimeout(load, 350); return () => clearTimeout(t); }, [q]);

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div>
        <h2 className="font-black text-xl">Auditoría</h2>
        <p className="text-sm text-ink-mute">Registro inmutable de acciones sensibles: quién, qué y cuándo.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setSensitive(!sensitive)}
          className={`px-3 py-2 rounded-xl font-bold text-sm ${sensitive ? 'bg-cartel text-white' : 'bg-white text-zinc-600 shadow'}`}>
          {sensitive ? '✓ ' : ''}Solo sensibles
        </button>
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow">
          {['', 'INFO', 'WARN', 'ALERT'].map((s) => (
            <button key={s} onClick={() => setSev(s)} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${sev === s ? 'bg-ink text-white' : 'text-zinc-600'}`}>{s || 'Todo'}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar acción/entidad…"
          className="px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-sm flex-1 min-w-[180px]" />
      </div>

      {error ? <ErrorState error={error} onRetry={load} />
        : !items ? <Spinner label="Cargando auditoría…" />
          : !items.length ? <EmptyState icon="🛡️" title="Sin eventos" hint="No hay registros para este filtro." />
            : (
              <div className="card overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead><tr className="text-left text-ink-mute border-b">
                    <th className="p-3">Fecha</th><th>Acción</th><th>Usuario</th><th>Detalle</th><th>Sev.</th>
                  </tr></thead>
                  <tbody>
                    {items.map((e) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50 align-top">
                        <td className="p-3 whitespace-nowrap text-ink-mute">{fecha(e.created_at)}</td>
                        <td className="font-semibold">{label(e.action)}</td>
                        <td className="whitespace-nowrap">{e.user ? <>{e.user.name} <span className="text-xs text-ink-mute">· {roleLabel(e.user.role)}</span></> : <span className="text-ink-mute">sistema</span>}</td>
                        <td className="max-w-md"><Detail e={e} /></td>
                        <td><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEV[e.severity] || SEV.INFO}`}>{e.severity}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      {items && <p className="text-xs text-ink-mute px-2">Mostrando hasta 200 eventos. La auditoría es de solo lectura e inmutable.</p>}
    </div>
  );
}

function Detail({ e }) {
  const m = e.metadata;
  if (!m || typeof m !== 'object') return <span className="text-ink-mute">{e.entity}</span>;
  // Render legible para los casos más útiles.
  if (e.action === 'STOCK_AJUSTE') return <span>{m.ingredient}: <b>{m.stock_anterior} → {m.stock_nuevo}</b>{m.unidad ? ' ' + m.unidad : ''} · {m.motivo}{m.observacion ? ` (${m.observacion})` : ''}{m.tipo ? <span className="text-zinc-400"> · {m.tipo === 'AJUSTE' ? 'suma/resta' : 'reemplazo'}</span> : ''}</span>;
  if (e.action === 'SALE_VOID') return <span>Orden #{m.order_number} · ${Number(m.total || 0).toLocaleString('es-CL')} {m.reason ? `· ${m.reason}` : ''}</span>;
  if (e.action === 'PERMISSION_UPDATE') return <span>{m.role} · {m.permission} → {m.allowed ? 'sí' : 'no'}</span>;
  if (e.action === 'CASH_CLOSE') return <span>Descuadre: ${Number(m.diff_total || 0).toLocaleString('es-CL')}{m.has_descuadre ? ' ⚠️' : ''}</span>;
  const keys = Object.keys(m).slice(0, 3);
  return <span className="text-ink-mute">{keys.map((k) => `${k}: ${typeof m[k] === 'object' ? '…' : m[k]}`).join(' · ')}</span>;
}
