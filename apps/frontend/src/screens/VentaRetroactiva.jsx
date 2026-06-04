import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, EmptyState, humanizeError } from '../components/ui/States.jsx';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const PAYMENTS = [['EFECTIVO', '💵 Efectivo'], ['POS', '💳 Tarjeta'], ['TRANSFERENCIA', '📲 Transferencia']];
const MOTIVOS = ['No ingresada por falla', 'Corte de luz / internet', 'Pedido telefónico', 'Error de caja', 'Otro'];
// Fecha/hora local en formato de los inputs (YYYY-MM-DD y HH:MM).
const pad = (n) => String(n).padStart(2, '0');
const hoyFecha = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const horaAhora = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// HU-VTA-07 · Registro de venta RETROACTIVA (fecha/hora pasada). Flujo separado
// de la venta rápida de caja, solo para roles con permiso sales.backdate.
export default function VentaRetroactiva({ user }) {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({});           // product_id -> { name, price, qty }
  const [fecha, setFecha] = useState(hoyFecha());
  const [hora, setHora] = useState(horaAhora());
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');
  const [retro, setRetro] = useState(null);
  const [uuid, setUuid] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => { api('/products').then(setProducts).catch((e) => setError(e.message)); }, []);
  useEffect(() => { api('/reports/retroactivas').then(setRetro).catch(() => {}); }, [done]);

  const items = useMemo(() => Object.entries(cart).filter(([, v]) => v.qty > 0), [cart]);
  const total = items.reduce((s, [, v]) => s + v.qty * v.price, 0);
  const add = (p, d) => setCart((c) => ({ ...c, [p.id]: { name: p.name, price: p.price, qty: Math.max(0, (c[p.id]?.qty || 0) + d) } }));
  const reason = motivo === 'Otro' ? otro.trim() : motivo;

  // Fecha/hora declarada como Date (local) y validaciones.
  const soldAt = useMemo(() => (fecha && hora ? new Date(`${fecha}T${hora}`) : null), [fecha, hora]);
  const esFutura = soldAt && soldAt.getTime() > Date.now() + 60_000;
  const diasAtras = soldAt ? (Date.now() - soldAt.getTime()) / 86_400_000 : 0;
  const muyAntigua = diasAtras > 30;
  const puedeGuardar = items.length > 0 && reason.trim() && soldAt && !esFutura && !muyAntigua && total > 0;

  async function guardar() {
    setError('');
    if (!puedeGuardar) return;
    setBusy(true);
    try {
      const r = await api('/sales/backdate', {
        method: 'POST',
        body: {
          client_uuid: uuid,
          sold_at: soldAt.toISOString(),
          reason: reason.trim(),
          payment_method: metodo,
          items: items.map(([product_id, v]) => ({ product_id, qty: v.qty })),
        },
      });
      setDone(r);
    } catch (e) {
      setError(e.message === 'FECHA_FUTURA' ? 'La fecha/hora no puede ser futura.'
        : e.message === 'FECHA_DEMASIADO_ANTIGUA' ? 'No se permiten ventas de más de 30 días atrás.'
        : e.message === 'MOTIVO_OBLIGATORIO' ? 'Indica el motivo.'
        : humanizeError(e));
    } finally { setBusy(false); }
  }
  function nueva() { setCart({}); setMotivo(''); setOtro(''); setDone(null); setUuid(crypto.randomUUID()); setFecha(hoyFecha()); setHora(horaAhora()); }

  if (error && !products) return <EmptyState icon="⚠️" title="No se pudo cargar" hint={humanizeError(error)} />;
  if (!products) return <Spinner label="Cargando productos…" />;

  // Pantalla de confirmación posterior al guardado.
  if (done) {
    return (
      <div className="max-w-md mx-auto card p-6 text-center mt-6">
        <div className="text-5xl mb-2">✅</div>
        <h2 className="font-black text-xl">Venta retroactiva registrada</h2>
        <p className="text-ink-mute mt-1">Orden #{done.order_number} · {money(done.total)} · día {done.business_day}</p>
        <div className="bg-amber-50 text-amber-700 rounded-xl p-3 text-sm mt-4 text-left">
          Marcada como <b>retroactiva</b> y registrada en auditoría. Aparece en Ventas y reportes con la fecha declarada.
        </div>
        <button onClick={nueva} className="w-full btn-pos bg-cartel text-white mt-4">Registrar otra</button>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const visible = products.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 60);

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div>
        <h2 className="font-black text-xl">Venta retroactiva 🕓</h2>
        <p className="text-sm text-ink-mute">Registra una venta que ocurrió antes y no se ingresó a tiempo. Flujo separado de la caja.</p>
      </div>

      <div className="card bg-amber-50 border-amber-200 p-3 text-sm text-amber-800">
        ⚠️ Estás registrando una venta con <b>fecha/hora pasada</b>. Esta acción queda <b>auditada</b> a tu nombre ({user?.name}).
      </div>
      {error && <p className="text-red-600 font-semibold">{humanizeError(error)}</p>}

      <div className="grid md:grid-cols-2 gap-3">
        {/* Izquierda: fecha/hora + motivo + productos */}
        <div className="space-y-3">
          <div className="card p-4 grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-ink-mute flex flex-col gap-1">Fecha de la venta
              <input type="date" max={hoyFecha()} value={fecha} onChange={(e) => setFecha(e.target.value)} className="field" />
            </label>
            <label className="text-xs font-bold text-ink-mute flex flex-col gap-1">Hora
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="field" />
            </label>
            {esFutura && <p className="col-span-2 text-xs text-red-600 font-semibold">La fecha/hora no puede ser futura.</p>}
            {muyAntigua && <p className="col-span-2 text-xs text-red-600 font-semibold">Máximo 30 días hacia atrás.</p>}
          </div>

          <div className="card p-4">
            <label className="text-xs font-bold text-ink-mute">Motivo / justificación *</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {MOTIVOS.map((m) => (
                <button key={m} onClick={() => setMotivo(m)} className={`rounded-xl py-2 px-2 text-sm font-bold text-left ${motivo === m ? 'bg-cartel text-white' : 'bg-slate-100 text-zinc-700'}`}>{m}</button>
              ))}
            </div>
            {motivo === 'Otro' && (
              <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Especifica el motivo" className="field mt-2" maxLength={200} />
            )}
          </div>

          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" className="field" />
          <div className="card divide-y max-h-72 overflow-auto">
            {visible.map((p) => (
              <button key={p.id} onClick={() => add(p, +1)} className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-left">
                <span className="font-semibold">{p.name}</span>
                <span className="text-ink-mute">{money(p.price)} <span className="text-cartel font-bold">+</span></span>
              </button>
            ))}
            {!visible.length && <p className="p-4 text-ink-mute text-center">Sin resultados.</p>}
          </div>
        </div>

        {/* Derecha: carrito + pago + resumen */}
        <div className="space-y-3">
          <div className="card p-4">
            <h3 className="font-black mb-2">Pedido</h3>
            {items.length === 0 ? <p className="text-ink-mute text-sm">Agrega productos desde la izquierda.</p> : (
              <div className="space-y-2">
                {items.map(([id, v]) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="flex-1 font-semibold truncate">{v.name}</span>
                    <button onClick={() => add({ id, name: v.name, price: v.price }, -1)} className="w-7 h-7 rounded-full bg-slate-100 font-black">−</button>
                    <span className="w-6 text-center font-black">{v.qty}</span>
                    <button onClick={() => add({ id, name: v.name, price: v.price }, +1)} className="w-7 h-7 rounded-full bg-slate-100 font-black">+</button>
                    <span className="w-20 text-right tabular-nums font-bold">{money(v.qty * v.price)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 font-black text-lg"><span>Total</span><span>{money(total)}</span></div>
              </div>
            )}
          </div>

          <div className="card p-4">
            <label className="text-xs font-bold text-ink-mute">Forma de pago</label>
            <div className="flex gap-2 mt-1">
              {PAYMENTS.map(([id, lbl]) => (
                <button key={id} onClick={() => setMetodo(id)} className={`flex-1 py-2 rounded-xl font-bold text-sm ${metodo === id ? 'bg-cartel text-white' : 'bg-slate-100 text-zinc-600'}`}>{lbl}</button>
              ))}
            </div>
          </div>

          {/* Resumen de trazabilidad */}
          <div className="card p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-ink-mute">Fecha/hora de la venta</span><b>{soldAt ? soldAt.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</b></div>
            <div className="flex justify-between"><span className="text-ink-mute">Se registra ahora</span><b>{new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</b></div>
            <div className="flex justify-between"><span className="text-ink-mute">Registrado por</span><b>{user?.name}</b></div>
            <div className="flex justify-between"><span className="text-ink-mute">Marca</span><span className="text-amber-600 font-bold">Retroactiva</span></div>
          </div>

          <button onClick={guardar} disabled={!puedeGuardar || busy}
            className="w-full btn-pos bg-cartel text-white disabled:opacity-50">
            {busy ? 'Guardando…' : 'Registrar venta retroactiva'}
          </button>
          <p className="text-[11px] text-ink-mute text-center">No impacta la caja abierta actual: se refleja en el día/hora declarado.</p>
        </div>
      </div>

      {retro && retro.detalle.length > 0 && (
        <div className="card p-4">
          <h3 className="font-black mb-2">Historial de retroactivas (90 días)</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {retro.por_usuario.map((u) => (
              <span key={u.usuario} className="text-sm bg-slate-100 rounded-full px-3 py-1 font-semibold">{u.usuario}: <b>{u.n}</b> · {money(u.total)}</span>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-bold text-ink-mute">Ver detalle ({retro.detalle.length})</summary>
            <ul className="mt-2 divide-y text-sm">
              {retro.detalle.map((d, i) => (
                <li key={i} className="py-1.5 flex justify-between gap-2">
                  <span className="min-w-0">#{d.order_number} · {d.usuario}<span className="block text-xs text-ink-mute truncate">{d.reason}</span></span>
                  <span className="text-right whitespace-nowrap">{money(d.total)}<span className="block text-[11px] text-ink-mute">{new Date(d.sold_at).toLocaleDateString('es-CL')}</span></span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
