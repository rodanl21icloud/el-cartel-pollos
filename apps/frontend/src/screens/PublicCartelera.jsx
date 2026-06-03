import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getCategoryAsset } from '../lib/categoryAssets.js';

// Reparte las categorías en `n` columnas balanceando la altura estimada
// (items + encabezado). Greedy: cada categoría va a la columna más corta.
// Evita el recorte impredecible de CSS multi-column con altura fija.
function distribuirColumnas(categories, n) {
  const cols = Array.from({ length: n }, () => ({ alturas: 0, cats: [] }));
  for (const c of categories) {
    const peso = c.items.length + 1.6; // ~1 fila por item + encabezado
    const menor = cols.reduce((a, b) => (b.alturas < a.alturas ? b : a));
    menor.cats.push(c); menor.alturas += peso;
  }
  return cols.map((c) => c.cats);
}

// ============================================================
// Cartelera pública para PANTALLA (sin login). Se abre en un TV/monitor en
// /cartelera/:slug (o /tv/:slug). Diseñada a 1280×720 (16:9) y auto-escalada
// para llenar cualquier pantalla horizontal sin scroll. Usa el mismo endpoint
// público del catálogo, así que refleja la carta y se auto-refresca.
// ============================================================
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const BASE_W = 1280, BASE_H = 720; // lienzo 16:9 de diseño

export default function PublicCartelera({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const wrapRef = useRef(null);
  const boardRef = useRef(null);
  const bodyRef = useRef(null);
  const colsRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [innerScale, setInnerScale] = useState(1);

  // Carga + auto-refresco cada 60s (para reflejar cambios de precio/carta).
  useEffect(() => {
    let alive = true;
    const fetchData = () => fetch(`/api/public/catalog/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no'))))
      .then((d) => { if (alive) { setData(d); setError(''); } })
      .catch(() => { if (alive && !data) setError('Cartelera no encontrada'); });
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [slug]);

  // Escala el lienzo fijo (1280×720) para llenar el viewport manteniendo 16:9,
  // y reduce el contenido si excediera el alto disponible (nunca recorta).
  useLayoutEffect(() => {
    function fit() {
      const wrap = wrapRef.current; if (!wrap) return;
      setScale(Math.min(wrap.clientWidth / BASE_W, wrap.clientHeight / BASE_H));
      const body = bodyRef.current, cols = colsRef.current;
      if (body && cols) {
        const avail = body.clientHeight, need = cols.scrollHeight;
        setInnerScale(need > avail ? avail / need : 1);
      }
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [data]);

  if (error) {
    return (
      <div className="w-screen h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-2xl font-bold opacity-70">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="w-screen h-screen bg-zinc-950 text-white flex items-center justify-center">
        <p className="text-2xl font-bold animate-pulse opacity-70">Cargando cartelera…</p>
      </div>
    );
  }

  const { business, categories } = data;

  return (
    <div ref={wrapRef} className="w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* Lienzo fijo 16:9, escalado para llenar la pantalla */}
      <div
        ref={boardRef}
        style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})`, transformOrigin: 'center center' }}
        className="bg-zinc-900 text-white flex flex-col shrink-0 shadow-2xl"
      >
        {/* Encabezado */}
        <header className="bg-cartel px-8 py-4 flex items-center justify-between shrink-0">
          <h1 className="text-3xl font-black tracking-tight uppercase leading-none">{business.name}</h1>
          {business.instagram && <span className="text-white/85 font-bold text-lg">{business.instagram}</span>}
        </header>

        {/* Cuerpo: categorías repartidas manualmente en columnas a lo ancho */}
        <div ref={bodyRef} className="flex-1 overflow-hidden px-8 py-5">
          <div ref={colsRef} className="flex gap-10 items-start"
            style={{ transform: `scale(${innerScale})`, transformOrigin: 'top left', width: `${100 / innerScale}%` }}>
            {distribuirColumnas(categories, categories.length > 4 ? 3 : 2).map((col, ci) => (
              <div key={ci} className="flex-1 min-w-0">
                {col.map((c) => {
                  const asset = getCategoryAsset(c.name);
                  return (
                    <section key={c.name} className="mb-4">
                      <h2 className="flex items-center gap-2 text-amber-400 font-black text-xl uppercase tracking-wide border-b-2 border-white/15 pb-1 mb-1.5">
                        <span>{asset.emoji}</span> {c.name}
                      </h2>
                      <ul>
                        {c.items.map((p, i) => (
                          <li key={i} className="flex items-baseline gap-2 py-[3px]">
                            <span className="font-semibold text-[15px] leading-tight">{p.name}</span>
                            <span className="flex-1 border-b border-dotted border-white/20 translate-y-[-3px]" />
                            <span className="font-black text-amber-400 text-lg tabular-nums whitespace-nowrap">{money(p.price)}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Pie */}
        <footer className="bg-zinc-950 text-white/55 text-xs px-8 py-2 flex items-center justify-between shrink-0">
          <span>{business.address || ''}</span>
          <span>{business.whatsapp ? `📲 ${business.whatsapp}` : ''}</span>
        </footer>
      </div>
    </div>
  );
}
