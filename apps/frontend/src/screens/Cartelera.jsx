import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { getCategoryAsset } from '../lib/categoryAssets.js';
import { Spinner, ErrorState, EmptyState } from '../components/ui/States.jsx';

// KAN-22 · Cartelera. Genera una cartelera de precios desde la carta actual.
// Fuente única: GET /products/catalog (mismos nombres/precios/categorías que la Carta).
// Esta vista es de SOLO LECTURA de precios: para cambiarlos se usa la Carta.
const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const CAT_ORDER = ['POLLO', 'COMBOS', 'COLACIONES', 'PAPAS', 'SNACKS', 'BEBIDAS'];
const catLabel = (c) => c.charAt(0) + c.slice(1).toLowerCase();

export default function Cartelera() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set()); // ids incluidos en la cartelera
  const [cat, setCat] = useState('TODO');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      // El endpoint ya devuelve solo productos activos (is_active = 1).
      const data = await api('/products/catalog');
      setItems(data);
      setSelected(new Set(data.map((p) => p.id))); // todos marcados por defecto
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Pestañas de categoría: TODO + las de CAT_ORDER presentes + otras que existan.
  const tabs = useMemo(() => {
    const presentes = CAT_ORDER.filter((c) => items.some((p) => p.category === c));
    const otras = [...new Set(items.map((p) => p.category))].filter((c) => !CAT_ORDER.includes(c));
    return ['TODO', ...presentes, ...otras];
  }, [items]);

  // Orden de categorías para agrupar (CAT_ORDER primero, luego el resto alfabético).
  const orderCat = (a, b) => {
    const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  };

  const visibles = items.filter((p) => cat === 'TODO' || p.category === cat);
  const seleccionados = items.filter((p) => selected.has(p.id));

  // Productos seleccionados agrupados y ordenados por categoría (para la cartelera).
  const grupos = useMemo(() => {
    const byCat = {};
    for (const p of seleccionados) (byCat[p.category] ||= []).push(p);
    return Object.keys(byCat).sort(orderCat).map((c) => ({
      cat: c,
      productos: byCat[c].sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [seleccionados]);

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  // Marca/desmarca todos los VISIBLES (respeta el filtro de categoría activo).
  function setAllVisible(on) {
    setSelected((s) => {
      const n = new Set(s);
      for (const p of visibles) on ? n.add(p.id) : n.delete(p.id);
      return n;
    });
  }
  const visiblesSel = visibles.filter((p) => selected.has(p.id)).length;

  if (loading) return <Spinner label="Cargando la carta…" />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Aislamiento de impresión: al imprimir, solo se ve la cartelera (no el panel ni el menú). */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #cartelera-print, #cartelera-print * { visibility: visible !important; }
          #cartelera-print { position: absolute !important; left: 0; top: 0; width: 100%; border-radius: 0 !important; }
          .no-print { display: none !important; }
          @page { margin: 10mm; }
        }
        #cartelera-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="flex items-center justify-between gap-2 flex-wrap mb-3 no-print">
        <div>
          <h2 className="font-black text-xl">Cartelera</h2>
          <p className="text-xs text-zinc-500">Elige qué productos destacar. Los precios son los de tu Carta (solo lectura).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="px-3 py-2 rounded-xl bg-zinc-200 font-bold text-sm" title="Volver a cargar precios desde la Carta">↻ Actualizar</button>
          <button onClick={() => window.print()} disabled={!seleccionados.length}
            className="px-4 py-2 rounded-xl bg-ink text-white font-bold text-sm disabled:opacity-50">🖨️ Imprimir / Capturar</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
        {/* ───────── Panel izquierdo: selector ───────── */}
        <div className="bg-white rounded-2xl shadow p-4 no-print">
          {/* Filtro por categoría (igual que en Carta) */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {tabs.map((t) => {
              const asset = t !== 'TODO' ? getCategoryAsset(t) : null;
              const active = cat === t;
              return (
                <button key={t} onClick={() => setCat(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold whitespace-nowrap text-sm transition-all ${
                    active
                      ? (asset ? `bg-gradient-to-r ${asset.gradient} text-white shadow-md` : 'bg-cartel text-white')
                      : (asset ? `${asset.bgColor} ${asset.textColor}` : 'bg-white text-zinc-600 border border-zinc-200')
                  }`}>
                  {asset && <span>{asset.emoji}</span>}
                  {t === 'TODO' ? 'Todo' : catLabel(t)}
                </button>
              );
            })}
          </div>

          {/* Acciones masivas + contador */}
          <div className="flex items-center justify-between text-xs text-zinc-500 mt-2 mb-1 px-1">
            <span><b className="text-zinc-700">{seleccionados.length}</b> de {items.length} en la cartelera</span>
            <span className="flex gap-2">
              <button onClick={() => setAllVisible(true)} className="font-bold text-cartel hover:underline">Marcar todos</button>
              <button onClick={() => setAllVisible(false)} className="font-bold text-zinc-500 hover:underline">Ninguno</button>
            </span>
          </div>

          {/* Lista de productos con checkbox */}
          <div className="divide-y max-h-[65vh] overflow-y-auto">
            {visibles.map((p) => {
              const on = selected.has(p.id);
              const asset = getCategoryAsset(p.category);
              return (
                <label key={p.id} className={`flex items-center gap-3 py-2.5 px-1 cursor-pointer ${on ? '' : 'opacity-50'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(p.id)}
                    className="w-5 h-5 accent-cartel shrink-0" />
                  <span className="text-lg shrink-0">{asset.emoji}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-sm truncate">{p.name}</span>
                    <span className="block text-[11px] text-zinc-400">{catLabel(p.category)}</span>
                  </span>
                  <span className="font-black tabular-nums text-sm">{money(p.price)}</span>
                </label>
              );
            })}
            {!visibles.length && <p className="text-center text-zinc-400 text-sm py-8">Sin productos en {catLabel(cat)}.</p>}
          </div>
        </div>

        {/* ───────── Panel derecho: preview de la cartelera ───────── */}
        <div className="lg:sticky lg:top-4">
          {!seleccionados.length ? (
            <div className="bg-white rounded-2xl shadow">
              <EmptyState icon="📋" title="Cartelera vacía"
                hint="Marca productos en el panel de la izquierda para verlos aquí." />
            </div>
          ) : (
            <CarteleraBoard grupos={grupos} />
          )}
        </div>
      </div>
    </div>
  );
}

// Lienzo visual de la cartelera (fondo oscuro, precios destacados). Es lo único
// que se imprime (id="cartelera-print").
function CarteleraBoard({ grupos }) {
  const hoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div id="cartelera-print" className="bg-zinc-900 text-white rounded-2xl shadow-xl overflow-hidden">
      {/* Encabezado */}
      <div className="bg-cartel px-6 py-5 text-center">
        <h1 className="text-3xl font-black tracking-tight">EL CARTEL DE LOS POLLOS</h1>
        <p className="text-white/80 text-sm font-semibold capitalize mt-0.5">{hoy}</p>
      </div>

      <div className="p-6 space-y-6">
        {grupos.map(({ cat, productos }) => {
          const asset = getCategoryAsset(cat);
          return (
            <section key={cat}>
              <h2 className="flex items-center gap-2 text-amber-400 font-black text-xl uppercase tracking-wide border-b border-white/15 pb-1 mb-2">
                <span>{asset.emoji}</span> {cat}
              </h2>
              <ul>
                {productos.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-3 py-1.5">
                    <span className="font-semibold text-base leading-tight">{p.name}</span>
                    {/* línea de puntos para guiar el ojo hacia el precio */}
                    <span className="flex-1 border-b border-dotted border-white/25 translate-y-[-3px]" />
                    <span className="font-black text-amber-400 text-xl tabular-nums whitespace-nowrap">{money(p.price)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
