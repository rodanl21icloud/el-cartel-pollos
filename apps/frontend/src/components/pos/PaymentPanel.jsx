import { useState } from 'react';
import { api } from '../../lib/api.js';
import { money, PAY_CARDS, DISCOUNT_MAX_PCT } from './posShared.js';

// --- Confirmación de la venta: productos + pago (estilo Treinta) ---
export default function PaymentPanel({ lines, subtotal, onBack, onCreate }) {
  const [method, setMethod] = useState('EFECTIVO');
  const [discPct, setDiscPct] = useState('');
  const [discAmt, setDiscAmt] = useState('');
  const [domicilio, setDomicilio] = useState(false);
  const [phone, setPhone] = useState('');
  const [cname, setCname] = useState('');
  const [address, setAddress] = useState('');
  const [fee, setFee] = useState('');
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notify, setNotify] = useState(false);
  const [notifyPhone, setNotifyPhone] = useState('');
  const [supUser, setSupUser] = useState('');   // validación de supervisor (descuentos altos)
  const [supPass, setSupPass] = useState('');
  const [error, setError] = useState('');

  const discount = Math.min(Math.max(0, Number(discAmt) || 0), subtotal);
  const deliveryFee = domicilio ? Math.max(0, Number(fee) || 0) : 0;
  const net = Math.max(0, subtotal - discount) + deliveryFee;
  // % efectivo del descuento aplicado (para exigir supervisor sobre el tope).
  const pct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
  const needsSupervisor = pct > DISCOUNT_MAX_PCT;

  function changePct(v) {
    setDiscPct(v);
    const p = Math.min(100, Math.max(0, Number(v) || 0));
    setDiscAmt(String(Math.round(subtotal * p / 100)));
  }
  function changeAmt(v) {
    setDiscAmt(v);
    const amt = Math.min(subtotal, Math.max(0, Number(v) || 0));
    setDiscPct(subtotal > 0 ? String(Math.round(amt / subtotal * 100)) : '0');
  }

  // Buscar cliente por teléfono y autocompletar.
  async function lookupPhone() {
    if (!phone.trim()) return;
    try {
      const c = await api(`/clients?phone=${encodeURIComponent(phone.trim())}`);
      if (c && c.id) { setCname(c.name || ''); setAddress(c.address || ''); setFound(true); }
      else setFound(false);
    } catch { /* */ }
  }

  async function create() {
    setError('');
    if (needsSupervisor && !(supUser.trim() && supPass)) {
      setError(`Descuento sobre ${DISCOUNT_MAX_PCT}%: requiere validación de un supervisor.`);
      return;
    }
    setBusy(true);
    const client = domicilio && (phone.trim() || cname.trim())
      ? { phone: phone.trim(), name: cname.trim() || 'Cliente', address: address.trim() } : null;
    const np = notify && notifyPhone.length === 8 ? '569' + notifyPhone : null;
    const supervisorAuth = needsSupervisor ? { username: supUser.trim(), password: supPass } : null;
    try {
      await onCreate(method, { discount, client, deliveryFee, notifyPhone: np, supervisorAuth });
    } catch (e) {
      setError(e?.message === 'DISCOUNT_REQUIRES_SUPERVISOR'
        ? 'Credenciales de supervisor inválidas o sin permiso para autorizar el descuento.'
        : (e?.message || 'No se pudo crear la venta.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      {/* Productos */}
      <div>
        <button onClick={onBack} className="mb-3 px-3 py-2 rounded-lg bg-zinc-200 font-bold">← Volver al pedido</button>
        <div className="bg-white rounded-2xl p-4 shadow">
          <h2 className="font-black text-lg mb-3">Productos</h2>
          <ul className="divide-y">
            {lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-bold">{l.name}</div>
                  {(l.modifiers || []).map((m, k) => <div key={k} className="text-xs text-zinc-500">› {m.name}</div>)}
                  <div className="text-sm text-zinc-500">{l.qty} × {money(l.price)}</div>
                </div>
                <div className="font-bold">{money(l.price * l.qty)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Pago */}
      <div className="bg-white rounded-2xl p-5 shadow">
        <h2 className="font-black text-lg mb-3">Pago</h2>

        <label className="block font-bold text-zinc-700 mb-1">Descuento</label>
        <div className="flex items-center gap-2 mb-4">
          <div className="relative w-24">
            <input type="number" min="0" max="100" value={discPct} onChange={(e) => changePct(e.target.value)} placeholder="0"
              className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            <span className="absolute right-3 top-2 text-zinc-400">%</span>
          </div>
          <span className="text-zinc-400 font-bold">=</span>
          <div className="relative flex-1">
            <span className="absolute left-3 top-2 text-zinc-400">$</span>
            <input type="number" min="0" value={discAmt} onChange={(e) => changeAmt(e.target.value)} placeholder="0"
              className="w-full pl-7 pr-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
          </div>
        </div>

        {/* Validación de supervisor para descuentos sobre el tope */}
        {needsSupervisor && (
          <div className="space-y-2 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="text-sm font-bold text-amber-800">🔐 Descuento sobre {DISCOUNT_MAX_PCT}%: autorización de supervisor</div>
            <input value={supUser} onChange={(e) => setSupUser(e.target.value)} placeholder="Usuario supervisor" autoComplete="off"
              className="w-full px-3 py-2 rounded-xl border-2 border-amber-200 focus:border-cartel outline-none" />
            <input value={supPass} onChange={(e) => setSupPass(e.target.value)} placeholder="Contraseña" type="password" autoComplete="new-password"
              className="w-full px-3 py-2 rounded-xl border-2 border-amber-200 focus:border-cartel outline-none" />
          </div>
        )}

        {/* Cliente / Entrega */}
        <div className="flex items-center justify-between mb-2">
          <label className="font-bold text-zinc-700">Entrega a domicilio</label>
          <button onClick={() => setDomicilio(!domicilio)}
            className={`w-12 h-7 rounded-full transition relative ${domicilio ? 'bg-green-500' : 'bg-zinc-300'}`}>
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${domicilio ? 'left-[1.4rem]' : 'left-0.5'}`} />
          </button>
        </div>
        {domicilio && (
          <div className="space-y-2 mb-4 bg-zinc-50 rounded-xl p-3">
            <div className="flex gap-2">
              <input value={phone} onChange={(e) => { setPhone(e.target.value); setFound(false); }} onBlur={lookupPhone} placeholder="Teléfono"
                className="flex-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" inputMode="tel" />
              {found && <span className="text-green-600 text-xs self-center font-bold">✓ cliente</span>}
            </div>
            <input value={cname} onChange={(e) => setCname(e.target.value)} placeholder="Nombre del cliente"
              className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección de entrega"
              className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            <div className="relative">
              <span className="absolute left-3 top-2 text-zinc-400">$</span>
              <input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Costo de envío"
                className="w-full pl-7 pr-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            </div>
          </div>
        )}

        {/* Aviso por WhatsApp cuando el pedido esté listo */}
        <div className="flex items-center justify-between mb-2">
          <label className="font-bold text-zinc-700">Avisar por WhatsApp al estar listo</label>
          <button onClick={() => setNotify(!notify)}
            className={`w-12 h-7 rounded-full transition relative ${notify ? 'bg-green-500' : 'bg-zinc-300'}`}>
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${notify ? 'left-[1.4rem]' : 'left-0.5'}`} />
          </button>
        </div>
        {notify && (
          <div className="flex items-center gap-2 mb-4 bg-green-50 rounded-xl p-3">
            <span className="font-black text-zinc-600 whitespace-nowrap">+56 9</span>
            <input value={notifyPhone} onChange={(e) => setNotifyPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="8 dígitos" inputMode="numeric"
              className="flex-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none tabular-nums tracking-wider" />
            {notifyPhone.length === 8 && <span className="text-green-600 text-lg">✓</span>}
          </div>
        )}

        <label className="block font-bold text-zinc-700 mb-2">Método de pago</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {PAY_CARDS.map((m) => (
            <button key={m.id} onClick={() => setMethod(m.id)}
              className={`rounded-xl py-3 px-2 border-2 text-center relative ${method === m.id ? 'border-green-500 bg-green-50' : 'border-zinc-200'}`}>
              {method === m.id && <span className="absolute top-1 right-1 text-green-600 text-sm">✓</span>}
              <div className="text-2xl">{m.icon}</div>
              <div className="text-xs font-bold mt-1">{m.label}</div>
            </button>
          ))}
        </div>

        <div className="border-t pt-3 text-sm space-y-1 mb-4">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-red-600"><span>Descuento</span><span>− {money(discount)}</span></div>}
          {deliveryFee > 0 && <div className="flex justify-between"><span>Envío</span><span>{money(deliveryFee)}</span></div>}
          <div className="flex justify-between text-xl font-black pt-1"><span>Total</span><span>{money(net)}</span></div>
        </div>

        {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}

        <button onClick={create} disabled={busy}
          className="btn-pos w-full bg-cartel text-white disabled:opacity-50 flex items-center justify-between px-6">
          <span>{busy ? 'Creando…' : 'Crear venta'}</span><span>{money(net)} →</span>
        </button>
      </div>
    </div>
  );
}
