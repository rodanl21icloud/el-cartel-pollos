import { money } from './posShared.js';

// Panel del pedido (carrito): líneas con nota, +/- cantidad, total y botón Cobrar.
export default function Cart({ lines, total, totalUnidades, onInc, onDec, onNote, onCheckout }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]">
      <h2 className="font-black text-lg mb-2">Pedido {totalUnidades > 0 && <span className="text-sm text-zinc-400">({totalUnidades})</span>}</h2>
      <div className="flex-1 space-y-2 overflow-auto">
        {lines.map((l) => (
          <div key={l.uid} className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-sm">{l.name}</span>
              {l.modifiers.map((m, i) => (
                <div key={i} className="text-xs text-zinc-500">› {m.name}{m.price_delta > 0 ? ` +${money(m.price_delta)}` : ''}</div>
              ))}
              <input value={l.note || ''} onChange={(e) => onNote(l.uid, e.target.value)} placeholder="Nota (ej: sin ají, bien cocido)"
                className="mt-1 w-full text-xs px-2 py-1 rounded-lg border border-zinc-200 focus:border-cartel outline-none" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => onDec(l.uid)} className="w-8 h-8 rounded-lg bg-zinc-200 text-xl font-black">−</button>
              <span className="w-5 text-center font-bold">{l.qty}</span>
              <button onClick={() => onInc(l.uid)} className="w-8 h-8 rounded-lg bg-zinc-200 text-xl font-black">+</button>
            </div>
          </div>
        ))}
        {!lines.length && <p className="text-zinc-400">Toca productos para agregar.</p>}
      </div>
      <div className="border-t mt-3 pt-3">
        <div className="flex justify-between text-2xl font-black mb-3"><span>Total</span><span>{money(total)}</span></div>
        <button disabled={!lines.length} onClick={onCheckout}
          className="btn-pos w-full bg-cartel text-white disabled:opacity-40 text-xl py-4 font-black">Cobrar →</button>
      </div>
    </div>
  );
}
