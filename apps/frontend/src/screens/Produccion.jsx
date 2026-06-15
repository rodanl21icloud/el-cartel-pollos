import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { humanizeError } from '../components/ui/States.jsx';

// Producción de pollo del turno: registra lotes al horno / precocidos para mañana.
// La conciliación fina (vs vendido/merma) se ve en "Hoy" (gerencia).
const fecha = (iso) => { try { return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export default function Produccion() {
  const [data, setData] = useState(null);
  const [kind, setKind] = useState('HORNO');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api('/oven/today').then(setData).catch((e) => setError(humanizeError(e)));
  useEffect(() => { load(); }, []);

  async function registrar(e) {
    e.preventDefault();
    setError('');
    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) return setError('Cantidad inválida (pollos enteros).');
    setBusy(true);
    try {
      await api('/oven', { method: 'POST', body: { kind, qty: n, note: note.trim() || undefined } });
      setQty(''); setNote(''); load();
    } catch (e) { setError(humanizeError(e)); }
    setBusy(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="font-black text-xl">Producción de pollo</h2>
        <p className="text-sm text-ink-mute">Registra lo que mandas al horno y lo que dejas precocido para mañana.</p>
      </div>

      {/* Resumen del día */}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 text-center"><div className="text-3xl font-black text-cartel">{data.horno}</div><div className="text-xs text-ink-mute">al horno hoy</div></div>
          <div className="card p-4 text-center"><div className="text-3xl font-black">{data.precocido}</div><div className="text-xs text-ink-mute">precocido p/ mañana</div></div>
        </div>
      )}

      {/* Registrar lote */}
      <form onSubmit={registrar} className="card p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setKind('HORNO')}
            className={`py-3 rounded-xl font-bold border-2 ${kind === 'HORNO' ? 'border-cartel bg-cartel/10 text-cartel' : 'border-zinc-200 text-ink-mute'}`}>🔥 Al horno</button>
          <button type="button" onClick={() => setKind('PRECOCIDO')}
            className={`py-3 rounded-xl font-bold border-2 ${kind === 'PRECOCIDO' ? 'border-cartel bg-cartel/10 text-cartel' : 'border-zinc-200 text-ink-mute'}`}>🧊 Precocido</button>
        </div>
        <input type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Cantidad de pollos (enteros)"
          className="w-full px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-lg" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)"
          className="w-full px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-sm" />
        {error && <p className="text-red-600 font-semibold text-sm">{error}</p>}
        <button disabled={busy} className="w-full btn-pos bg-cartel text-white disabled:opacity-50">{busy ? 'Registrando…' : 'Registrar lote'}</button>
      </form>

      {/* Lotes del día */}
      {data?.batches?.length > 0 && (
        <div className="card p-4">
          <h3 className="font-black mb-2">Lotes de hoy</h3>
          <ul className="divide-y text-sm">
            {data.batches.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2">
                <span>{b.kind === 'HORNO' ? '🔥' : '🧊'} <b>{b.qty}</b> {b.kind === 'HORNO' ? 'al horno' : 'precocido'}
                  {b.note ? <span className="text-ink-mute"> · {b.note}</span> : ''}</span>
                <span className="text-xs text-ink-mute">{fecha(b.at)} · {b.usuario || ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
