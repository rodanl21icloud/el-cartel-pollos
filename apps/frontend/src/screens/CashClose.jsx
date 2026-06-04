import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import AbrirCajaModal from '../components/AbrirCajaModal.jsx';
import { DENOMS, denomTotal, DenomCounter } from '../components/denoms.jsx';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// Caja: apertura con fondo -> operación (depósitos) -> cierre CIEGO.
export default function CashClose({ userName }) {
  const [session, setSession] = useState(null); // { open, opening_float, movements }
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showApertura, setShowApertura] = useState(true); // KAN-31: modal de apertura al entrar con caja cerrada

  async function load() {
    setLoading(true);
    try { setSession(await api('/cash-register/current')); } catch { /* */ }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) return <p className="text-zinc-500 text-center mt-10">Cargando caja…</p>;
  if (result) {
    const onNew = () => { setResult(null); setShowApertura(true); load(); };
    // El cajero (cierre ciego sin permiso de reportes) solo ve la confirmación.
    return result.blind ? <BlindClosed onNew={onNew} /> : <CloseResult result={result} onNew={onNew} />;
  }
  // Caja cerrada: se exige declarar el fondo de apertura (KAN-31).
  if (!session?.open) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-2xl p-8 shadow text-center mt-6">
        <div className="text-5xl mb-2">🔒</div>
        <h2 className="text-2xl font-black mb-1">Caja cerrada</h2>
        <p className="text-zinc-500 mb-5">Abre la caja declarando el fondo para comenzar el turno.</p>
        <button onClick={() => setShowApertura(true)} className="btn-pos bg-cartel text-white w-full">Abrir caja</button>
        {showApertura && (
          <AbrirCajaModal
            onOpened={() => { setShowApertura(false); load(); }}
            onCancel={() => setShowApertura(false)}
            userName={userName}
          />
        )}
      </div>
    );
  }
  return <OpenSession session={session} onClosed={setResult} reload={load} error={error} setError={setError} />;
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
  const [cierre, setCierre] = useState({ pollos_crudos_fin: '', merma_pollos: '', sacos_papas_fin: '' });
  const [obsCierre, setObsCierre] = useState('');
  const [busy, setBusy] = useState(false);

  const efectivo = counting ? denomTotal(efectivoCounts) : Number(efectivoManual) || 0;
  function setCount(v, val) { setEfectivoCounts((c) => ({ ...c, [v]: Math.max(0, Math.floor(Number(val) || 0)) })); }
  const setCi = (k, v) => setCierre((c) => ({ ...c, [k]: v }));
  // Conteo de cierre obligatorio (enteros ≥ 0).
  const cierreOk = ['pollos_crudos_fin', 'merma_pollos', 'sacos_papas_fin'].every((k) => {
    const v = String(cierre[k]).trim(); const n = Number(v);
    return v !== '' && Number.isInteger(n) && n >= 0;
  });

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
          pollos_crudos_fin: Number(cierre.pollos_crudos_fin),
          merma_pollos: Number(cierre.merma_pollos),
          sacos_papas_fin: Number(cierre.sacos_papas_fin),
          obs_cierre: obsCierre.trim() || undefined,
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

        {/* Conteo de cierre de turno (no afecta el inventario). */}
        <div className="border-t pt-3 mb-3">
          <p className="font-bold text-zinc-700 mb-2">Cierre de turno 🐔</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['pollos_crudos_fin', 'Pollos crudos'],
              ['merma_pollos', 'Merma pollos'],
              ['sacos_papas_fin', 'Sacos de papa'],
            ].map(([k, label]) => (
              <label key={k} className="block">
                <span className="block text-xs font-semibold text-zinc-500 mb-1">{label}</span>
                <input type="number" min="0" step="1" inputMode="numeric" value={cierre[k]}
                  onChange={(e) => setCi(k, e.target.value)} placeholder="0"
                  className="w-full px-2 py-2 text-lg text-center rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
              </label>
            ))}
          </div>
          <textarea value={obsCierre} onChange={(e) => setObsCierre(e.target.value)} rows={2}
            placeholder="Observación (opcional)"
            className="w-full mt-2 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-sm" />
          {!cierreOk && <p className="text-amber-600 text-xs font-semibold mt-1">Completa el conteo de cierre (números enteros).</p>}
        </div>

        {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
        <button onClick={cerrar} disabled={busy || !cierreOk} className="w-full btn-pos bg-cartel text-white disabled:opacity-50">
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
