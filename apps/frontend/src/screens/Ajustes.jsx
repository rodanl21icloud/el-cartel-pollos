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
        name: f.name, address: f.address, phone: f.phone, rut: f.rut, footer: f.footer, paper_width: Number(f.paper_width),
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

      {needsOtp && (
        <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP de gerencia" inputMode="numeric"
          className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      )}

      <div className="flex gap-2">
        <button onClick={save} className="flex-1 btn-pos bg-cartel text-white">Guardar</button>
        <button onClick={() => openPrint(buildCustomerReceiptHTML(demo, f))} className="px-4 rounded-2xl bg-zinc-200 font-bold">Probar boleta</button>
      </div>
      {toast && <p className="mt-3 text-center font-bold text-green-600">{toast}</p>}
    </div>
  );
}
