// Buscador + pestañas de categoría del catálogo del POS.
export default function ProductSearch({ search, onSearch, cat, onCat, tabs }) {
  return (
    <>
      <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar producto…"
        className="w-full mb-2 px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
        {tabs.map((t) => (
          <button key={t} onClick={() => onCat(t)}
            className={`px-4 py-2 rounded-full font-bold whitespace-nowrap ${cat === t ? 'bg-cartel text-white' : 'bg-white text-zinc-600 border border-zinc-200'}`}>
            {t === 'TODO' ? 'Todo' : t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
    </>
  );
}
