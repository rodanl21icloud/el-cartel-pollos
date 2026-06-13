import { useState } from 'react';
import { recordSale } from '../../lib/offlineStore.js';
import { PAYMENTS } from './posShared.js';

// --- Venta libre (ingreso por monto, sin productos) ---
export default function VentaLibre({ onSold }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function cobrar(method) {
    setError('');
    const amt = Number(amount);
    if (!(amt > 0)) return setError('Ingresa un monto válido');
    setBusy(true);
    const soldAt = new Date().toISOString();
    // Sin claves undefined: se perderían al serializar y romperían el hash HMAC.
    const payload = { client_uuid: crypto.randomUUID(), payment_method: method, sold_at: soldAt, free_amount: amt };
    if (note.trim()) payload.note = note.trim();
    try {
      const res = await recordSale(payload);
      const data = { order_number: res.order_number ?? null, total: amt, payment_method: method, sold_at: soldAt,
        items: [{ name: note.trim() || 'Venta libre', qty: 1, line_total: amt }], offline: !res.synced };
      setAmount(''); setNote('');
      onSold(data);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl p-6 shadow">
      <h2 className="text-2xl font-black mb-1">Venta libre</h2>
      <p className="text-zinc-500 text-sm mb-4">Registra un ingreso por un monto, sin descontar inventario.</p>
      <label className="block font-bold text-zinc-700 mb-1">Monto</label>
      <input type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
        className="w-full mb-4 px-4 py-4 text-3xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <label className="block font-bold text-zinc-700 mb-1">Descripción (opcional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: producto fuera de carta"
        className="w-full mb-4 px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
      <div className="grid gap-2">
        {PAYMENTS.map((m) => (
          <button key={m.id} disabled={busy} onClick={() => cobrar(m.id)}
            className={`btn-pos text-white disabled:opacity-40 ${m.color}`}>{m.label}</button>
        ))}
      </div>
    </div>
  );
}
