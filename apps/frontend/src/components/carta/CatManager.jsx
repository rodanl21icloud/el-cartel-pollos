// Gestor de categorías: renombrar o fusionar (eliminar = mover sus productos a otra).
export default function CatManager({ items, onClose, onRename }) {
  const counts = {};
  for (const p of items) counts[p.category] = (counts[p.category] || 0) + 1;
  const cats = Object.keys(counts).sort();
  function ren(c) {
    const to = window.prompt(`Nuevo nombre para "${c}":`, c);
    if (to && to.trim().toUpperCase() !== c) onRename(c, to.trim().toUpperCase());
  }
  function del(c) {
    const dest = window.prompt(`Para eliminar "${c}", sus ${counts[c]} producto(s) se moverán a otra categoría.\nEscribe la categoría destino:\n(${cats.filter((x) => x !== c).join(', ')})`);
    if (dest && dest.trim()) onRename(c, dest.trim().toUpperCase());
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-1">Categorías</h3>
        <p className="text-xs text-zinc-500 mb-3">Para crear una nueva, escríbela al crear o editar un producto.</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {cats.map((c) => (
            <div key={c} className="flex items-center justify-between bg-zinc-50 rounded-xl px-3 py-2">
              <div className="font-bold">{c} <span className="text-zinc-400 font-normal text-sm">({counts[c]})</span></div>
              <div className="flex gap-1">
                <button onClick={() => ren(c)} className="px-2.5 py-1 rounded-lg bg-white border text-xs font-bold">✏️ Renombrar</button>
                <button onClick={() => del(c)} className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold">🗑 Eliminar</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full mt-4 py-2.5 rounded-xl bg-zinc-100 font-bold">Cerrar</button>
      </div>
    </div>
  );
}
