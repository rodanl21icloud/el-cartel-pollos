import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// Caja: apertura con fondo -> operación (depósitos) -> cierre CIEGO.
export default function CashClose() {
  const [session, setSession] = useState(null); // { open, opening_float, movements }
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try { setSession(await api('/cash-register/current')); } catch { /* */ }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-zinc-500 text-center mt-10">Cargando caja…</p>;
  if (result) return <CloseResult result={result} onNew={() => { setResult(null); load(); }} />;
  if (!session?.open) return <OpenBox onOpened={load} />;
  return <OpenSession session={session} onClosed={setResult} reload={load} error={error} setError={setError} />;
}

// --- Apertura de caja ---
function OpenBox({ onOpened }) {
  const [fondo, setFondo] = useState('');
  const [error, setError] = useState('');
  async function open() {
    setError('');
    try {
      await api('/cash-register/open', { method: 'POST', body: { opening_float: Number(fondo || 0) } });
      onOpened();
    } catch (e) { setError(e.message === 'CAJA_YA_ABIERTA' ? 'Ya hay una caja abierta' : e.message); }
  }
  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl p-6 shadow">
      <h2 className="text-2xl font-black">Abrir caja</h2>
      <p className="text-zinc-500 text-sm mb-5">Declara el fondo inicial (vuelto) con el que parte la caja.</p>
      <label className="block font-bold text-zinc-700 mb-1">Fondo inicial</label>
      <input type="number" min="0" inputMode="decimal" value={fondo} onChange={(e) => setFondo(e.target.value)} autoFocus
        className="w-full mb-4 px-4 py-4 text-2xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
      <button onClick={open} className="w-full btn-pos bg-cartel text-white">Abrir caja</button>
    </div>
  );
}

// --- Caja abierta: depósitos + cierre ciego ---
function OpenSession({ session, onClosed, reload, error, setError }) {
  const [efectivo, setEfectivo] = useState('');
  const [pos, setPos] = useState('');
  const [transf, setTransf] = useState('');
  const [depAmount, setDepAmount] = useState('');
  const [depReason, setDepReason] = useState('');

  async function deposito() {
    setError('');
    if (!(Number(depAmount) > 0)) return setError('Monto de depósito inválido');
    if (!depReason.trim()) return setError('Indica el motivo del depósito');
    try {
      await api('/cash-register/movement', {
        method: 'POST',
        body: { type: 'DEPOSITO', amount: Number(depAmount), reason: depReason.trim() },
      });
      setDepAmount(''); setDepReason('');
      reload();
    } catch (e) { setError(e.message); }
  }

  async function cerrar() {
    setError('');
    try {
      const data = await api('/cash-register/close', {
        method: 'POST',
        body: {
          efectivo_declarado: Number(efectivo || 0),
          pos_declarado: Number(pos || 0),
          transferencias_declaradas: Number(transf || 0),
        },
      });
      onClosed(data);
    } catch (e) { setError(e.message === 'CAJA_CERRADA' ? 'La caja no está abierta' : e.message); }
  }

  const Field = ({ label, value, set }) => (
    <div className="mb-3">
      <label className="block font-bold text-zinc-700 mb-1">{label}</label>
      <input type="number" min="0" inputMode="decimal" value={value} onChange={(e) => set(e.target.value)}
        className="w-full px-4 py-4 text-2xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
    </div>
  );

  const depositos = session.movements.filter((m) => m.type === 'DEPOSITO');

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Estado de caja */}
      <div className="bg-white rounded-2xl p-4 shadow flex items-center justify-between">
        <div>
          <div className="text-sm text-zinc-500">Caja abierta · fondo inicial</div>
          <div className="text-2xl font-black">{money(session.opening_float)}</div>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-green-600 text-white font-bold">ABIERTA</span>
      </div>

      {/* Depósito de efectivo */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h3 className="font-black mb-2">Depósito de efectivo (sale de caja)</h3>
        <div className="flex gap-2 mb-2">
          <input type="number" min="0" placeholder="Monto" value={depAmount} onChange={(e) => setDepAmount(e.target.value)}
            className="w-1/2 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
          <input placeholder="Motivo" value={depReason} onChange={(e) => setDepReason(e.target.value)}
            className="w-1/2 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        </div>
        <button onClick={deposito} className="w-full rounded-xl bg-zinc-800 text-white font-bold py-2">Registrar depósito</button>
        {depositos.length > 0 && (
          <ul className="mt-2 text-sm text-zinc-600">
            {depositos.map((m, i) => (
              <li key={i} className="flex justify-between"><span>{m.reason}</span><span>−{money(m.amount)}</span></li>
            ))}
          </ul>
        )}
      </div>

      {/* Cierre ciego */}
      <div className="bg-white rounded-2xl p-6 shadow">
        <h2 className="text-2xl font-black">Cierre de Caja Ciego</h2>
        <p className="text-zinc-500 text-sm mb-4">
          Declara lo contado. No verás el total esperado hasta confirmar.
        </p>
        <Field label="Efectivo contado" value={efectivo} set={setEfectivo} />
        <Field label="POS / Tarjetas" value={pos} set={setPos} />
        <Field label="Transferencias" value={transf} set={setTransf} />
        {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
        <button onClick={cerrar} className="w-full btn-pos bg-cartel text-white">Confirmar cierre</button>
      </div>
    </div>
  );
}

// --- Resultado del cierre (revela el teórico) ---
function CloseResult({ result, onNew }) {
  const d = result.diferencias;
  const c = result.componentes;
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

      <div className="bg-zinc-50 rounded-xl p-3 text-sm mb-4">
        <div className="font-bold mb-1">Cómo se calculó el efectivo</div>
        {row('Fondo inicial', result.opening_float)}
        {row('+ Ventas efectivo', c.ventas_efectivo)}
        {row('− Gastos efectivo', -c.gastos_efectivo)}
        {row('+/− Movimientos', c.movimientos_efectivo)}
        <div className="border-t mt-1 pt-1 flex justify-between font-bold">
          <span>= Efectivo esperado</span><span>{money(result.teorico.efectivo)}</span>
        </div>
      </div>

      <div className="text-sm">
        {row('Diferencia efectivo', d.efectivo)}
        {row('Diferencia POS', d.pos)}
        {row('Diferencia transferencias', d.transferencias)}
        <div className="border-t mt-2 pt-2 text-lg">{row('Diferencia total', d.total)}</div>
      </div>

      <button onClick={onNew} className="w-full btn-pos bg-cartel text-white mt-6">Nueva apertura</button>
    </div>
  );
}
