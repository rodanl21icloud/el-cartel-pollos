import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { money } from './posShared.js';

// --- Elegir tipo de venta (estilo "Nueva venta" de Treinta) ---
const PITCH = ['El más completo 🔥', 'Ideal para compartir', 'El favorito de la familia', 'Combo estrella ⭐'];
const TIPS = ['🥤 Ofrece bebida 1.5L', '🍟 Suma papas familiares', '🌶️ Pregunta por salsas extra', '🍗 Sugiere subir a pollo entero'];

export default function SaleChooser({ onPick, onPickProduct }) {
  const [top, setTop] = useState([]);
  useEffect(() => { api('/products/top?limit=3').then(setTop).catch(() => {}); }, []);

  return (
    <div className="max-w-2xl mx-auto mt-4 space-y-3">
      {/* Acción dominante */}
      <button onClick={() => onPick('productos')}
        className="w-full bg-cartel text-white rounded-2xl p-6 shadow-card text-left flex items-center gap-4 hover:opacity-95 transition">
        <div className="text-4xl">🛒</div>
        <div className="min-w-0">
          <div className="text-2xl font-black">Venta de productos</div>
          <div className="text-white/80 text-sm mt-0.5">Selecciona productos de tu carta y cobra.</div>
        </div>
        <span className="ml-auto text-2xl">→</span>
      </button>
      {/* Acción secundaria */}
      <button onClick={() => onPick('libre')}
        className="w-full bg-white rounded-xl p-3 shadow-card text-left flex items-center gap-3 text-zinc-600 hover:bg-slate-50 transition">
        <span className="text-xl">🧾</span>
        <div><div className="font-bold text-sm">Venta libre</div><div className="text-xs text-zinc-400">Ingreso por un monto, sin seleccionar productos.</div></div>
      </button>

      {/* Más vendidos (click = agregar al carro) */}
      {top.length > 0 && (
        <div className="pt-3">
          <div className="text-xs font-black uppercase tracking-wide text-zinc-400 mb-2">🔥 Los más vendidos · toca para agregar</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {top.map((p, i) => (
              <button key={p.id} onClick={() => onPickProduct(p)}
                className="bg-white rounded-xl p-3 shadow-card text-left hover:ring-2 hover:ring-cartel transition">
                <div className="font-bold text-sm text-ink leading-tight line-clamp-2">{p.name}</div>
                <div className="text-cartel font-black mt-1">{money(p.price)}</div>
                <div className="text-[11px] text-zinc-400 mt-0.5">{p.units > 0 ? `${p.units} vendidos · toca para agregar` : (PITCH[i % PITCH.length] + ' · agregar')}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {TIPS.map((t) => <span key={t} className="text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">{t}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}
