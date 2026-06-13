import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { buildCustomerReceiptHTML } from '../lib/receipt.js';
import { openPrint } from '../lib/print.js';

// Datos del negocio que salen en los comprobantes. Requiere settings.manage.
export default function Ajustes({ role }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState('');
  const [otp, setOtp] = useState('');
  const [toast, setToast] = useState('');
  const needsOtp = role !== 'GERENCIA';

  useEffect(() => { api('/settings').then(setF).catch((e) => setError(e.message)); }, []);
  if (!f) return <p className="text-zinc-500 text-center mt-10">Cargando…</p>;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setError('');
    try {
      const saved = await api('/settings', { method: 'PUT', body: {
        name: f.name, address: f.address, phone: f.phone, rut: f.rut, footer: f.footer, paper_width: Number(f.paper_width), cartelera_theme: f.cartelera_theme || 'western',
      }, otp: needsOtp && otp ? otp : undefined });
      setF(saved); setToast('Guardado'); setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setError(e.message === 'OTP_GERENCIA_REQUERIDO' ? 'Ingresa el OTP de gerencia' : e.message === 'OTP_INVALIDO' ? 'OTP incorrecto' : e.message);
    }
  }

  const demo = {
    order_number: 7, total: 37980, payment_method: 'EFECTIVO', sold_at: new Date().toISOString(),
    items: [{ name: 'Combo Familiar', qty: 2, line_total: 37980 }],
  };

  const Field = ({ label, k, ph }) => (
    <div className="mb-3">
      <label className="block font-bold text-zinc-700 mb-1">{label}</label>
      <input value={f[k] || ''} onChange={set(k)} placeholder={ph}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl p-5 shadow">
      <h2 className="font-black text-xl mb-4">Datos del negocio</h2>
      {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}

      <Field label="Nombre" k="name" ph="El Cartel de los Pollos" />
      <Field label="Dirección / zona" k="address" ph="Reparto a domicilio" />
      <Field label="Teléfono" k="phone" ph="+56 9 ..." />
      <Field label="RUT (opcional)" k="rut" ph="" />
      <Field label="Mensaje de pie" k="footer" ph="¡Gracias por tu pedido!" />

      <label className="block font-bold text-zinc-700 mb-1">Ancho de papel</label>
      <div className="flex gap-2 mb-3">
        {[58, 80].map((w) => (
          <button key={w} onClick={() => setF({ ...f, paper_width: w })}
            className={`flex-1 rounded-xl py-2 font-bold ${Number(f.paper_width) === w ? 'bg-cartel text-white' : 'bg-zinc-100'}`}>{w} mm</button>
        ))}
      </div>

      <label className="block font-bold text-zinc-700 mb-1">Plantilla de cartelera (TV)</label>
      <select value={f.cartelera_theme || 'western'} onChange={(e) => setF({ ...f, cartelera_theme: e.target.value })}
        className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none">
        <option value="western">Western (ámbar · Rye)</option>
        <option value="rojo">Rojo (Rye)</option>
        <option value="dorado">Dorado premium (Rye)</option>
        <option value="brasa">Brasa (naranja · Rye)</option>
        <option value="moderno">Moderno (cian · sans)</option>
        <option value="verde">Verde fresco (sans)</option>
        <option value="azul">Azul corporativo (sans)</option>
        <option value="minimal">Minimal (claro · sans)</option>
      </select>

      {needsOtp && (
        <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP de gerencia" inputMode="numeric"
          className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      )}

      <div className="flex gap-2">
        <button onClick={save} className="flex-1 btn-pos bg-cartel text-white">Guardar</button>
        <button onClick={() => openPrint(buildCustomerReceiptHTML(demo, f))} className="px-4 rounded-2xl bg-zinc-200 font-bold">Probar boleta</button>
      </div>
      {toast && <p className="mt-3 text-center font-bold text-green-600">{toast}</p>}

      <AdminPin hasPin={!!f.has_admin_pin} needsOtp={needsOtp} otp={otp}
        onSaved={() => setF({ ...f, has_admin_pin: true })} />
    </div>
  );
}

// PIN de administrador para autorizar ajustes manuales de stock.
function AdminPin({ hasPin, needsOtp, otp, onSaved }) {
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function save() {
    setErr(''); setMsg('');
    if (!/^\d{4,8}$/.test(pin)) return setErr('PIN de 4 a 8 dígitos');
    if (pin !== pin2) return setErr('Los PIN no coinciden');
    try {
      await api('/settings/admin-pin', { method: 'PUT', body: { pin }, otp: needsOtp && otp ? otp : undefined });
      setPin(''); setPin2(''); setMsg(hasPin ? 'PIN actualizado' : 'PIN configurado'); onSaved();
      setTimeout(() => setMsg(''), 2500);
    } catch (e) {
      setErr(e.message === 'OTP_GERENCIA_REQUERIDO' ? 'Ingresa el OTP de gerencia arriba' : e.message === 'OTP_INVALIDO' ? 'OTP incorrecto' : e.message);
    }
  }
  return (
    <div className="mt-6 pt-5 border-t">
      <h3 className="font-black text-lg mb-1">PIN de administrador</h3>
      <p className="text-sm text-zinc-500 mb-3">
        Autoriza los <b>ajustes manuales de stock</b> en Inventario. {hasPin
          ? <span className="text-green-600 font-semibold">Configurado ✓</span>
          : <span className="text-amber-600 font-semibold">Sin configurar.</span>}
      </p>
      {err && <p className="text-red-600 font-semibold text-sm mb-2">{err}</p>}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder={hasPin ? 'Nuevo PIN' : 'PIN (4-8 díg.)'} maxLength={8}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none tracking-widest" />
        <input type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
          placeholder="Repetir PIN" maxLength={8}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none tracking-widest" />
      </div>
      <button onClick={save} className="w-full rounded-xl bg-ink text-white font-bold py-2">{hasPin ? 'Actualizar PIN' : 'Configurar PIN'}</button>
      {msg && <p className="mt-2 text-center font-bold text-green-600">{msg}</p>}
    </div>
  );
}
