import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// Pantalla de gerencia: reporte del turno + edición de precios.
// La edición es PUT -> si el usuario no es GERENCIA, el backend exige OTP.
export default function Manage({ role }) {
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null); // { id, name, price }
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [prods] = await Promise.all([api('/products')]);
    setProducts(prods);
    if (role === 'GERENCIA') {
      try { setSummary(await api('/reports/turn-summary')); } catch { /* no-op */ }
    }
  }
  useEffect(() => { load().catch(() => {}); }, []);

  async function save() {
    setMsg('');
    try {
      await api(`/products/${editing.id}`, {
        method: 'PUT',
        body: { price: Number(editing.price) },
        otp: role === 'GERENCIA' ? undefined : otp, // header x-management-otp si aplica
      });
      setMsg(`Precio actualizado: ${editing.name}`);
      setEditing(null); setOtp('');
      await load();
    } catch (e) {
      setMsg(e.message === 'OTP_GERENCIA_REQUERIDO' ? 'Requiere OTP de gerencia'
        : e.message === 'OTP_INVALIDO' ? 'OTP incorrecto' : e.message);
    }
    setTimeout(() => setMsg(''), 3000);
  }

  return (
    <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
      {/* Reporte del turno (solo gerencia recibe datos) */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h2 className="font-black text-lg mb-3">Reporte del turno</h2>
        {role !== 'GERENCIA' ? (
          <p className="text-zinc-400">Solo gerencia puede ver el teórico del turno.</p>
        ) : summary ? (
          <>
            <div className="text-3xl font-black text-cartel mb-3">{money(summary.total)}</div>
            <table className="w-full text-sm mb-4">
              <tbody>
                {summary.by_method.map((m) => (
                  <tr key={m.payment_method} className="border-b">
                    <td className="py-1 font-semibold">{m.payment_method}</td>
                    <td className="text-right text-zinc-500">{m.ventas} vta</td>
                    <td className="text-right font-bold">{money(m.monto)}</td>
                  </tr>
                ))}
                {!summary.by_method.length && <tr><td className="text-zinc-400 py-2">Sin ventas en el turno.</td></tr>}
              </tbody>
            </table>
            <h3 className="font-bold mb-1">Más vendidos</h3>
            <ul className="text-sm space-y-1">
              {summary.top_products.map((p) => (
                <li key={p.name} className="flex justify-between">
                  <span>{p.name}</span><span className="text-zinc-500">x{p.unidades} · {money(p.monto)}</span>
                </li>
              ))}
              {!summary.top_products.length && <li className="text-zinc-400">—</li>}
            </ul>
          </>
        ) : <p className="text-zinc-400">Cargando…</p>}
      </div>

      {/* Edición de precios */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h2 className="font-black text-lg mb-3">Precios</h2>
        <ul className="space-y-2">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span className="font-semibold">{p.name}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold">{money(p.price)}</span>
                <button onClick={() => { setEditing({ id: p.id, name: p.name, price: p.price }); setOtp(''); }}
                  className="px-3 py-2 rounded-lg bg-zinc-100 font-bold">Editar</button>
              </div>
            </li>
          ))}
        </ul>

        {editing && (
          <div className="mt-4 border-t pt-4">
            <h3 className="font-bold mb-2">Nuevo precio — {editing.name}</h3>
            <input type="number" min="0" value={editing.price}
              onChange={(e) => setEditing({ ...editing, price: e.target.value })}
              className="w-full mb-3 px-4 py-3 text-xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            {role !== 'GERENCIA' && (
              <>
                <label className="block font-bold text-zinc-700 mb-1">OTP de gerencia</label>
                <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" placeholder="6 dígitos"
                  className="w-full mb-3 px-4 py-3 text-xl tracking-widest rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
              </>
            )}
            <div className="flex gap-2">
              <button onClick={save} className="flex-1 btn-pos bg-cartel text-white">Guardar</button>
              <button onClick={() => setEditing(null)} className="px-4 rounded-2xl bg-zinc-200 font-bold">Cancelar</button>
            </div>
          </div>
        )}
        {msg && <p className="mt-3 font-semibold text-cartel">{msg}</p>}
      </div>
    </div>
  );
}
