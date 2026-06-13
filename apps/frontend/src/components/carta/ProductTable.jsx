import { esNombreInvalido } from '../../lib/productName.js';
import { getCategoryAsset } from '../../lib/categoryAssets.js';
import { money, marginColor } from './cartaShared.js';
import PriceCell from './PriceCell.jsx';

// Tabla de productos de la Carta. Recibe los handlers de fila del contenedor.
export default function ProductTable({ visible, q, cat, onSavePrice, onRecipe, onRename, onToggleCatalog, onToggleAvailable, onHistory, onEdit, onRemove }) {
  return (
    <div className="bg-white rounded-2xl shadow overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="text-left text-zinc-500 border-b">
            <th className="p-3">Producto</th>
            <th className="p-3 text-right">Precio</th>
            <th className="p-3 text-right">Costo</th>
            <th className="p-3 text-right">Ganancia</th>
            <th className="p-3 text-center">Receta</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((p) => (
            <tr key={p.id} className={`border-b last:border-0 hover:bg-zinc-50 ${p.in_catalog === false ? 'opacity-50' : ''}`}>
              <td className="p-3">
                <div className="flex items-center gap-2">
                  {p.image_url
                    ? <img src={p.image_url || getCategoryAsset(p.category)?.image || ''} alt="" className="w-10 h-10 rounded-lg object-cover bg-zinc-100" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-300">🍗</div>}
                  <div>
                    <div className="font-bold flex items-center gap-1.5 flex-wrap">{p.name}
                      {/* KAN-28 (C): chip naranja si el nombre es inválido. Desaparece al renombrar (load() refresca). */}
                      {esNombreInvalido(p.name) && (
                        <button onClick={() => onRename(p)}
                          title="Este producto aparece con código en la grilla de venta. Edita el nombre para que sea descriptivo."
                          className="text-[10px] font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 px-1.5 py-0.5 rounded-full">
                          ⚠️ Nombre inválido
                        </button>
                      )}
                      {p.in_catalog === false && <span className="text-[10px] font-bold bg-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded">oculto</span>}
                      {p.available === false && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">agotado</span>}
                    </div>
                    <div className="text-xs text-zinc-400">{p.sku} · {p.category}</div>
                  </div>
                </div>
              </td>
              <td className="p-3 text-right">
                <PriceCell value={p.price} onSave={(v) => onSavePrice(p, v)} />
              </td>
              <td className="p-3 text-right tabular-nums text-zinc-600">{money(p.costo)}</td>
              <td className="p-3 text-right tabular-nums">
                <div className="font-bold">{money(p.ganancia)}</div>
                <div className={`text-xs font-bold ${marginColor(p.margen)}`}>{p.margen}%</div>
              </td>
              <td className="p-3 text-center">
                <button onClick={() => onRecipe(p)}
                  className={`text-sm font-bold ${p.has_recipe ? 'text-blue-600' : 'text-zinc-400'}`}>
                  {p.has_recipe ? 'Ver receta ›' : 'Agregar receta'}
                </button>
              </td>
              <td className="p-3 text-right whitespace-nowrap">
                <button onClick={() => onRename(p)} className="text-zinc-400 hover:text-cartel text-lg mr-1" title="Renombrar">✏️</button>
                <button onClick={() => onToggleCatalog(p)} className="text-lg mr-1" title={p.in_catalog === false ? 'Mostrar en catálogo' : 'Ocultar del catálogo'}>
                  {p.in_catalog === false ? '🙈' : '👁️'}
                </button>
                <button onClick={() => onToggleAvailable(p)} className="text-lg mr-1" title={p.available === false ? 'Marcar disponible' : 'Marcar agotado'}>{p.available === false ? '🔴' : '🟢'}</button>
                <button onClick={() => onHistory(p)} className="text-zinc-400 hover:text-cartel text-lg mr-1" title="Historial de precio">📈</button>
                <button onClick={() => onEdit(p)} className="text-zinc-400 hover:text-cartel text-lg mr-1" title="Foto y categoría">📷</button>
                <button onClick={() => onRemove(p)} className="text-zinc-400 hover:text-red-600 text-lg" title="Eliminar">🗑</button>
              </td>
            </tr>
          ))}
          {!visible.length && <tr><td colSpan="6" className="p-6 text-zinc-400 text-center text-sm">{q ? `Sin resultados para "${q}"` : cat !== 'TODO' ? `Sin productos en ${cat.charAt(0) + cat.slice(1).toLowerCase()}` : 'No hay productos aún.'}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
