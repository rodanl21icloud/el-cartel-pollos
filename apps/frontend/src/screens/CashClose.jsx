import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// Denominaciones CLP (billetes y monedas).
const DENOMS = [
  { v: 20000, t: 'billete' }, { v: 10000, t: 'billete' }, { v: 5000, t: 'billete' },
  { v: 2000, t: 'billete' }, { v: 1000, t: 'billete' },
  { v: 500, t: 'moneda' }, { v: 100, t: 'moneda' }, { v: 50, t: 'moneda' }, { v: 10, t: 'moneda' },
];
const denomTotal = (counts) => DENOMS.reduce((s, d) => s + d.v * (Number(counts[d.v]) || 0), 0);

// Conteo de billetes y monedas (reutilizable: apertura y cierre).
function DenomCounter({ counts, onChange }) {
  return (
    <div className="space-y-2">
      {DENOMS.map((d) => {
        const sub = d.v * (Number(counts[d.v]) || 0);
        return (
          <div key={d.v} className="flex items-center gap-3">
            <span className="text-lg">{d.t === 'billete' ? '💵' : '🪙'}</span>
            <span className="w-20 font-bold text-zinc-700">{money(d.v)}</span>
            <input type="number" min="0" inputMode="numeric" value={counts[d.v] ?? ''} placeholder="0"
              onChange={(e) => onChange(d.v, e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-right" />
            <span className="w-20 text-right text-zinc-500 text-sm tabular-nums">{money(sub)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Caja: apertura con fondo -> operación (depósitos) -> cierre CIEGO.
export default function CashClose({ userName }) {
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
  if (result) {
    const onNew = () => { setResult(null); load(); };
    // El cajero (cierre ciego sin permiso de reportes) solo ve la confirmación.
    return result.blind ? <BlindClosed onNew={onNew} /> : <CloseResult result={result} onNew={onNew} />;
  }
  if (!session?.open) return <OpenBox onOpened={load} userName={userName} />;
  return <OpenSession session={session} onClosed={setResult} reload={load} error={error} setError={setError} />;
}

// --- Apertura de caja: conteo de billetes y monedas por denominación ---
function OpenBox({ onOpened, userName }) {
  const [counting, setCounting] = useState(true);
  const [counts, setCounts] = useState({}); // denom -> cantidad
  const [fondoManual, setFondoManual] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const total = counting ? denomTotal(counts) : Number(fondoManual) || 0;

  function setCount(v, val) {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    setCounts((c) => ({ ...c, [v]: n }));
  }

  async function open() {
    setError(''); setBusy(true);
    try {
      const detail = {};
      if (counting) DENOMS.forEach((d) => { if (counts[d.v]) detail[d.v] = Number(counts[d.v]); });
      await api('/cash-register/open', {
        method: 'POST',
        body: { opening_float: total, detail: counting ? detail : undefined },
      });
      onOpened();
    } catch (e) {
      setError(e.message === 'CAJA_YA_ABIERTA' ? 'Ya hay una caja abierta'
        : e.message === 'CONTEO_NO_CUADRA' ? 'El conteo no cuadra con el fondo' : e.message);
    }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl shadow overflow-hidden">
      <div className="bg-cartel text-white px-5 py-4">
        <h2 className="text-2xl font-black">Abrir caja</h2>
        <p className="text-white/80 text-sm">Encargado: <b>{userName || 'Cajero'}</b></p>
      </div>

      <div className="p-5">
        <label className="flex items-center justify-between mb-4">
          <span className="font-bold text-zinc-700">Contar billetes y monedas</span>
          <button onClick={() => setCounting(!counting)}
            className={`w-12 h-7 rounded-full transition relative ${counting ? 'bg-green-500' : 'bg-zinc-300'}`}>
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${counting ? 'left-[1.4rem]' : 'left-0.5'}`} />
          </button>
        </label>

        {counting ? (
          <div className="mb-4"><DenomCounter counts={counts} onChange={setCount} /></div>
        ) : (
          <div className="mb-4">
            <label className="block font-bold text-zinc-700 mb-1">Fondo inicial</label>
            <input type="number" min="0" inputMode="decimal" value={fondoManual} onChange={(e) => setFondoManual(e.target.value)} autoFocus
              className="w-full px-4 py-4 text-2xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
          </div>
        )}

        <div className="flex items-center justify-between border-t pt-3 mb-4">
          <span className="text-lg font-bold">Total</span>
          <span className="text-2xl font-black text-cartel tabular-nums">{money(total)}</span>
        </div>

        {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
        <button onClick={open} disabled={busy} className="w-full btn-pos bg-cartel text-white disabled:opacity-50">
          {busy ? 'Abriendo…' : 'Empezar turno'}
        </button>
      </div>
    </div>
  );
}

// --- Caja abierta: depósitos + cierre ciego con conteo ---
function OpenSession({ session, onClosed, reload, error, setError }) {
  const [counting, setCounting] = useState(true);
  const [efectivoCounts, setEfectivoCounts] = useState({});
  const [efectivoManual, setEfectivoManual] = useState('');
  const [pos, setPos] = useState('');
  const [transf, setTransf] = useState('');
  const [depAmount, setDepAmount] = useState('');
  const [depReason, setDepReason] = useState('');
  const [busy, setBusy] = useState(false);

  const efectivo = counting ? denomTotal(efectivoCounts) : Number(efectivoManual) || 0;
  function setCount(v, val) { setEfectivoCounts((c) => ({ ...c, [v]: Math.max(0, Math.floor(Number(val) || 0)) })); }

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
    setError(''); setBusy(true);
    try {
      const detail = {};
      if (counting) DENOMS.forEach((d) => { if (efectivoCounts[d.v]) detail[d.v] = Number(efectivoCounts[d.v]); });
      const data = await api('/cash-register/close', {
        method: 'POST',
        body: {
          efectivo_declarado: efectivo,
          pos_declarado: Number(pos || 0),
          transferencias_declaradas: Number(transf || 0),
          detail: counting ? detail : undefined,
        },
      });
      onClosed(data);
    } catch (e) { setError(e.message === 'CAJA_CERRADA' ? 'La caja no está abierta' : e.message); }
    setBusy(false);
  }

  const depositos = session.movements.filter((m) => m.type === 'DEPOSITO');
  const totalDeclarado = efectivo + (Number(pos) || 0) + (Number(transf) || 0);

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

      {/* Cierre ciego con conteo */}
      <div className="bg-white rounded-2xl p-5 shadow">
        <h2 className="text-2xl font-black">Cerrar caja</h2>
        <p className="text-zinc-500 text-sm mb-4">Cuenta el efectivo y declara cada método. No verás el resultado al cerrar.</p>

        <label className="flex items-center justify-between mb-3">
          <span className="font-bold text-zinc-700">Contar billetes y monedas</span>
          <button onClick={() => setCounting(!counting)}
            className={`w-12 h-7 rounded-full transition relative ${counting ? 'bg-green-500' : 'bg-zinc-300'}`}>
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${counting ? 'left-[1.4rem]' : 'left-0.5'}`} />
          </button>
        </label>

        {counting ? (
          <DenomCounter counts={efectivoCounts} onChange={setCount} />
        ) : (
          <div>
            <label className="block font-bold text-zinc-700 mb-1">Efectivo contado</label>
            <input type="number" min="0" inputMode="decimal" value={efectivoManual} onChange={(e) => setEfectivoManual(e.target.value)}
              className="w-full px-4 py-3 text-2xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
          </div>
        )}

        <div className="flex justify-between border-t mt-3 pt-2 mb-3">
          <span className="font-bold">Efectivo</span><span className="font-black tabular-nums">{money(efectivo)}</span>
        </div>

        <label className="block font-bold text-zinc-700 mb-1">POS / Tarjetas</label>
        <input type="number" min="0" inputMode="decimal" value={pos} onChange={(e) => setPos(e.target.value)}
          className="w-full mb-3 px-4 py-3 text-xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <label className="block font-bold text-zinc-700 mb-1">Transferencias</label>
        <input type="number" min="0" inputMode="decimal" value={transf} onChange={(e) => setTransf(e.target.value)}
          className="w-full mb-3 px-4 py-3 text-xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

        <div className="flex justify-between text-lg font-black border-t pt-2 mb-4">
          <span>Total declarado</span><span className="text-cartel tabular-nums">{money(totalDeclarado)}</span>
        </div>

        {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
        <button onClick={cerrar} disabled={busy} className="w-full btn-pos bg-cartel text-white disabled:opacity-50">
          {busy ? 'Cerrando…' : 'Cerrar caja'}
        </button>
      </div>
    </div>
  );
}

// --- Cierre del cajero: confirmación SIN resumen (cierre ciego) ---
function BlindClosed({ onNew }) {
  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl p-8 shadow text-center mt-6">
      <div className="text-6xl mb-2">✅</div>
      <h2 className="text-2xl font-black mb-1">Caja cerrada</h2>
      <p className="text-zinc-500 mb-6">Turno cerrado correctamente. El resumen del turno lo revisa gerencia.</p>
      <button onClick={onNew} className="w-full btn-pos bg-cartel text-white">Listo</button>
    </div>
  );
}

// --- Resultado del cierre con RESUMEN del turno (solo gerencia) ---
function CloseResult({ result, onNew }) {
  const d = result.diferencias;
  const c = result.componentes;
  const rt = result.resumen_turno || {};
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

      {/* Resumen del turno */}
      <div className="bg-cartel/5 border border-cartel/20 rounded-xl p-3 text-sm mb-4">
        <div className="font-black mb-1 text-cartel">Resumen del turno</div>
        <div className="flex justify-between py-0.5"><span>Total ventas</span><b>{money(rt.total_ventas)}</b></div>
        <div className="flex justify-between py-0.5"><span>Total gastos</span><b>{money(rt.total_gastos)}</b></div>
        <div className="flex justify-between border-t mt-1 pt-1 text-base"><span className="font-bold">Balance</span><b>{money(rt.balance)}</b></div>
      </div>

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
