import { useState } from 'react';
import { money } from './posShared.js';

// Bottom sheet del carrito (solo móvil, < lg). El estado `open` es puramente
// visual: NO toca el carrito, ni la firma HMAC, ni la validación de caja.
export default function PosCartSheet({ lines, total, totalUnidades, onInc, onDec, onNote, onCheckout }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      {/* Backdrop al expandir */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[1px]" onClick={() => setOpen(false)} />
      )}

      {/* Sheet: peek (4.6rem) cuando cerrado, sube a 85vh cuando abierto */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.18)]
          flex flex-col max-h-[85vh] transition-transform duration-300 ease-out pb-[env(safe-area-inset-bottom)]
          ${open ? 'translate-y-0' : 'translate-y-[calc(100%-4.6rem)]'}`}
      >
        {/* Handle / barra peek — toca para abrir/cerrar */}
        <button onClick={() => setOpen((o) => !o)}
          className="relative shrink-0 px-4 pt-3 pb-3 flex items-center gap-3 active:bg-zinc-50 rounded-t-3xl">
          <span className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1.5 rounded-full bg-zinc-300" />
          <span className="flex items-center justify-center w-9 h-9 rounded-full bg-cartel text-white text-sm font-black shrink-0">{totalUnidades}</span>
          <span className="font-bold text-zinc-700">{open ? 'Ocultar pedido' : 'Ver pedido'}</span>
          <span className="ml-auto text-xl font-black">{money(total)}</span>
          <span className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {/* Líneas del pedido (scroll) — mismo render que Cart, sin lógica nueva */}
        <div className="flex-1 overflow-auto px-4 space-y-2">
          {lines.map((l) => (
            <div key={l.uid} className="flex items-start justify-between gap-2 border-b border-zinc-100 pb-2">
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-sm">{l.name}</span>
                {l.modifiers.map((m, i) => (
                  <div key={i} className="text-xs text-zinc-500">› {m.name}{m.price_delta > 0 ? ` +${money(m.price_delta)}` : ''}</div>
                ))}
                <input value={l.note || ''} onChange={(e) => onNote(l.uid, e.target.value)} placeholder="Nota (ej: sin ají)"
                  className="mt-1 w-full text-xs px-2 py-1 rounded-lg border border-zinc-200 focus:border-cartel outline-none" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => onDec(l.uid)} className="w-9 h-9 rounded-lg bg-zinc-200 text-xl font-black active:scale-95">−</button>
                <span className="w-5 text-center font-bold">{l.qty}</span>
                <button onClick={() => onInc(l.uid)} className="w-9 h-9 rounded-lg bg-zinc-200 text-xl font-black active:scale-95">+</button>
              </div>
            </div>
          ))}
          {!lines.length && <p className="text-zinc-400 py-6 text-center">Toca productos para agregar.</p>}
        </div>

        {/* Botón Cobrar — masivo, full-width */}
        <div className="shrink-0 p-3 border-t border-zinc-100">
          <button disabled={!lines.length} onClick={onCheckout}
            className="w-full bg-cartel text-white disabled:opacity-40 text-xl font-black py-4 rounded-2xl flex items-center justify-between px-6 active:scale-[0.99] transition">
            <span>Cobrar</span><span>{money(total)} →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
