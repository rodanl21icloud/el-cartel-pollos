import { useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// CIERRE CIEGO: el cajero declara montos SIN ver el teórico esperado.
// El resultado (diferencias) solo se revela tras enviar el cierre.
export default function CashClose() {
  const [efectivo, setEfectivo] = useState('');
  const [pos, setPos] = useState('');
  const [transf, setTransf] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(''); setLoading(true); setResult(null);
    try {
      const data = await api('/cash-register/close', {
        method: 'POST',
        body: {
          efectivo_declarado: Number(efectivo || 0),
          pos_declarado: Number(pos || 0),
          transferencias_declaradas: Number(transf || 0),
        },
      });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Error al cerrar');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    const d = result.diferencias;
    const row = (label, val) => (
      <div className="flex justify-between py-1">
        <span>{label}</span>
        <span className={val === 0 ? 'text-zinc-600' : val < 0 ? 'text-red-600 font-bold' : 'text-amber-600 font-bold'}>
          {val > 0 ? '+' : ''}{money(val)}
        </span>
      </div>
    );
    return (
      <div className="max-w-md mx-auto bg-white rounded-2xl p-6 shadow">
        <h2 className="text-2xl font-black mb-1">Resultado del cierre</h2>
        <p className={`mb-4 font-bold ${result.descuadre ? 'text-red-600' : 'text-green-600'}`}>
          {result.descuadre ? '⚠️ DESCUADRE DETECTADO' : '✓ Caja cuadrada'}
        </p>
        <div className="text-sm">
          {row('Efectivo', d.efectivo)}
          {row('POS', d.pos)}
          {row('Transferencias', d.transferencias)}
          <div className="border-t mt-2 pt-2 text-lg">{row('Diferencia total', d.total)}</div>
        </div>
        <button onClick={() => setResult(null)} className="w-full btn-pos bg-cartel text-white mt-6">
          Nuevo cierre
        </button>
      </div>
    );
  }

  const Field = ({ label, value, set }) => (
    <div className="mb-4">
      <label className="block font-bold text-zinc-700 mb-1">{label}</label>
      <input type="number" inputMode="decimal" min="0" value={value}
        onChange={(e) => set(e.target.value)}
        className="w-full px-4 py-4 text-2xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl p-6 shadow">
      <h2 className="text-2xl font-black">Cierre de Caja Ciego</h2>
      <p className="text-zinc-500 text-sm mb-5">
        Declara los montos contados. No verás el total esperado hasta confirmar.
      </p>
      <Field label="Efectivo contado" value={efectivo} set={setEfectivo} />
      <Field label="POS / Tarjetas" value={pos} set={setPos} />
      <Field label="Transferencias" value={transf} set={setTransf} />
      {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
      <button disabled={loading} onClick={submit}
        className="w-full btn-pos bg-cartel text-white disabled:opacity-50">
        {loading ? 'Procesando…' : 'Confirmar cierre'}
      </button>
    </div>
  );
}
