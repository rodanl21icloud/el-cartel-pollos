import { useState } from 'react';
import { api } from '../lib/api.js';
import { DENOMS, denomTotal, denomTocado, DenomCounter } from './denoms.jsx';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// ============================================================
// KAN-31 — Modal OBLIGATORIO de apertura de caja.
// La caja nunca debe abrirse sin que el usuario declare el fondo de apertura.
//   - El fondo es un campo REQUERIDO: no se puede confirmar vacío.
//   - $0 es válido SOLO si el usuario lo ingresa explícitamente
//     (escribe 0 a mano, o cuenta billetes y el total da 0).
//   - El modal no se cierra haciendo clic fuera (backdrop estático).
//   - "Cancelar" no abre la caja (deja el acceso bloqueado).
// ============================================================
export default function AbrirCajaModal({ onOpened, onCancel, userName }) {
  const [counting, setCounting] = useState(false); // por defecto: ingreso manual del fondo
  const [counts, setCounts] = useState({});         // denom -> cantidad
  const [fondoManual, setFondoManual] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const manualTrim = fondoManual.trim();
  const fondo = counting ? denomTotal(counts) : Number(manualTrim);

  // ¿El fondo fue ingresado EXPLÍCITAMENTE? (no vacío, número válido ≥ 0)
  const fondoExplicito = counting
    ? denomTocado(counts)
    : manualTrim !== '' && Number.isFinite(Number(manualTrim));
  const puedeAbrir = fondoExplicito && Number.isFinite(fondo) && fondo >= 0;

  function setCount(v, val) {
    const n = Math.max(0, Math.floor(Number(val) || 0));
    setCounts((c) => ({ ...c, [v]: n }));
  }

  async function abrir() {
    if (!puedeAbrir || busy) return;
    setError(''); setBusy(true);
    try {
      const detail = {};
      if (counting) DENOMS.forEach((d) => { if (counts[d.v]) detail[d.v] = Number(counts[d.v]); });
      await api('/cash-register/open', {
        method: 'POST',
        body: { opening_float: fondo, detail: counting ? detail : undefined },
      });
      onOpened && onOpened();
    } catch (e) {
      setError(e.message === 'CAJA_YA_ABIERTA' ? 'Ya hay una caja abierta'
        : e.message === 'CONTEO_NO_CUADRA' ? 'El conteo no cuadra con el fondo'
        : e.message === 'FONDO_INVALIDO' ? 'El fondo de apertura no es válido'
        : 'No se pudo abrir la caja. Intenta nuevamente.');
    }
    setBusy(false);
  }

  return (
    // Backdrop estático: el clic fuera NO cierra el modal (apertura obligatoria).
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden my-auto" role="dialog" aria-modal="true">
        <div className="bg-cartel text-white px-5 py-4">
          <h2 className="text-2xl font-black">Abrir caja</h2>
          <p className="text-white/80 text-sm">Encargado: <b>{userName || 'Cajero'}</b></p>
        </div>

        <div className="p-5">
          <p className="text-sm text-zinc-600 mb-4">Ingresa el dinero físico disponible al iniciar el turno.</p>

          <label className="flex items-center justify-between mb-4">
            <span className="font-bold text-zinc-700">Contar billetes y monedas</span>
            <button type="button" onClick={() => setCounting(!counting)}
              className={`w-12 h-7 rounded-full transition relative ${counting ? 'bg-green-500' : 'bg-zinc-300'}`}>
              <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${counting ? 'left-[1.4rem]' : 'left-0.5'}`} />
            </button>
          </label>

          {counting ? (
            <div className="mb-4"><DenomCounter counts={counts} onChange={setCount} /></div>
          ) : (
            <div className="mb-4">
              <label className="block font-bold text-zinc-700 mb-1">Fondo de apertura ($)</label>
              <input type="number" min="0" inputMode="decimal" value={fondoManual} placeholder="Ej: 5000" autoFocus
                onChange={(e) => setFondoManual(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') abrir(); }}
                className="w-full px-4 py-4 text-2xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3 mb-2">
            <span className="text-lg font-bold">Fondo de apertura</span>
            <span className="text-2xl font-black text-cartel tabular-nums">{money(puedeAbrir ? fondo : 0)}</span>
          </div>

          {!fondoExplicito && (
            <p className="text-amber-600 text-sm font-semibold mb-2">
              Ingresa el fondo de apertura para continuar. Si no hay efectivo, escribe <b>0</b>.
            </p>
          )}
          {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}

          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => onCancel && onCancel()}
              className="flex-1 py-3 rounded-xl bg-zinc-100 text-zinc-700 font-bold hover:bg-zinc-200">
              Cancelar
            </button>
            <button type="button" onClick={abrir} disabled={!puedeAbrir || busy}
              className="flex-[2] btn-pos bg-cartel text-white disabled:opacity-50">
              {busy ? 'Abriendo…' : 'Abrir caja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
