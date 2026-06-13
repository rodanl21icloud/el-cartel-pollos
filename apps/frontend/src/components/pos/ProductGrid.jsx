import { esNombreInvalido } from '../../lib/productName.js';
import { getCategoryAsset } from '../../lib/categoryAssets.js';
import { money } from './posShared.js';

// Grilla de productos. `qtyInCart(productId)` devuelve la cantidad ya en el carro.
export default function ProductGrid({ products, visible, qtyInCart, onTap }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 p-1">
      {visible.map((p) => {
        const qc = qtyInCart(p.id);
        // KAN-28 (B): marca en amarillo si el nombre es de código/ inválido. Sigue siendo seleccionable.
        const asset = getCategoryAsset(p.category);             const invalido = esNombreInvalido(p.name);
        const aviso = 'Este producto tiene un nombre de código. Edítalo en Carta';
        return (
          <button key={p.id} onClick={() => onTap(p)} title={invalido ? aviso : undefined}
            style={invalido ? { backgroundColor: '#FFF9C4' } : undefined}
            className={`text-zinc-800 border-2 rounded-2xl overflow-hidden text-left active:scale-95 transition relative ${invalido ? 'border-amber-400 hover:border-amber-500' : 'bg-white border-zinc-200 hover:border-cartel'}`}>
            {qc > 0 && <span className="absolute top-1 right-1 z-10 bg-cartel text-white text-xs font-black rounded-full w-6 h-6 flex items-center justify-center">{qc}</span>}
            {p.has_modifiers && <span className="absolute top-1 left-1 z-10 bg-amber-500 text-white text-[9px] font-bold rounded px-1">opciones</span>}
            {invalido && <span title={aviso} className="absolute bottom-[58px] left-1 z-10 bg-amber-400 text-amber-900 text-[10px] font-black rounded px-1.5 py-0.5 shadow">⚠️ código</span>}
            {(p.image_url || asset.image)
              ? <img src={p.image_url || asset.image} alt="" className="w-full h-20 object-cover bg-zinc-100" onError={(e) => { e.target.outerHTML = `<div class="w-full h-20 bg-gradient-to-br ${asset.gradient} flex items-center justify-center text-3xl">${asset.emoji}</div>`; }} />
              : <div className={`w-full h-20 bg-gradient-to-br ${asset.gradient} flex items-center justify-center text-3xl`}>{asset.emoji}</div>}
            <div className="p-2">
              <div title={p.name} className={`text-xs font-black leading-tight break-words ${invalido ? 'text-amber-900' : ''}`}>{invalido && <span aria-hidden>⚠️ </span>}{p.name}</div>
              <div className="text-cartel mt-1 font-bold text-sm">{money(p.price)}</div>
            </div>
          </button>
        );
      })}
      {!products.length && <p className="text-zinc-500 col-span-full">Cargando catálogo…</p>}
      {products.length > 0 && !visible.length && <p className="text-zinc-400 col-span-full">Sin resultados.</p>}
    </div>
  );
}
