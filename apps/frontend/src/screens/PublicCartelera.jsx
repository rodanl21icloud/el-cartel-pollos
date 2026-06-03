import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getCategoryAsset } from '../lib/categoryAssets.js';

// ============================================================
// Cartelera pública tipo "digital menuboard" (KFC/McDonald's) para TV 16:9.
// Sin login, sin interacción. Rota slides automáticamente cada 8s y refresca
// los datos cada 60s. El lienzo es siempre 1280×720 escalado a la pantalla.
//   /cartelera/:slug  |  /tv/:slug
// ============================================================
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const BASE_W = 1280, BASE_H = 720;
const SLIDE_MS = 8000;
const RYE = { fontFamily: "'Rye', serif" }; // tipografía western para títulos/precio destacado

// Logo del negocio (ilustración a color sobre fondo blanco -> se muestra tal cual).
function Logo({ className = 'h-10' }) {
  return (
    <img src="/logo.jpeg" alt="El Cartel de los Pollos"
      className={`${className} w-auto object-contain rounded-md`}
      style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.8))' }} />
  );
}

// Reparte categorías en `n` columnas balanceando la altura estimada (greedy).
function distribuirColumnas(categories, n) {
  const cols = Array.from({ length: n }, () => ({ altura: 0, cats: [] }));
  for (const c of categories) {
    const peso = c.items.length + 1.6; // ~1 fila por item + encabezado
    const menor = cols.reduce((a, b) => (b.altura < a.altura ? b : a));
    menor.cats.push(c); menor.altura += peso;
  }
  return cols.map((c) => c.cats);
}

// Definición de slides. Las dos primeras son "hero" (foto grande + lista);
// las siguientes son de columnas. La última recoge "todo lo demás".
const SLIDE_DEFS = [
  { layout: 'hero', cats: ['POLLO'] },
  { layout: 'hero', cats: ['COMBOS'] },
  { layout: 'cols', cats: ['COLACIONES', 'PAPAS', 'SNACKS'] },
  { layout: 'cols', cats: ['BEBIDAS'] },
];

// Construye los slides reales a partir de las categorías recibidas:
// salta categorías vacías/inexistentes y agrega las no contempladas al último.
function construirSlides(categories) {
  const byName = Object.fromEntries(categories.map((c) => [c.name, c]));
  const conocidas = new Set(SLIDE_DEFS.flatMap((d) => d.cats));
  const resto = categories.filter((c) => !conocidas.has(c.name)).map((c) => c.name);

  return SLIDE_DEFS
    .map((d, i) => {
      const nombres = i === SLIDE_DEFS.length - 1 ? [...d.cats, ...resto] : d.cats; // BEBIDAS + lo demás
      const cats = nombres.map((n) => byName[n]).filter((c) => c && c.items?.length);
      return { layout: d.layout, cats };
    })
    .filter((s) => s.cats.length);
}

const maxPrecio = (items) => Math.max(...items.map((i) => Number(i.price) || 0));

export default function PublicCartelera({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);

  const wrapRef = useRef(null);
  const boardRef = useRef(null);
  const bodyRef = useRef(null);
  const colsRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [innerScale, setInnerScale] = useState(1);

  // ── Fuente western 'Rye' (Google Fonts), inyectada una sola vez ────────
  useEffect(() => {
    if (!document.getElementById('rye-font')) {
      const link = document.createElement('link');
      link.id = 'rye-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Rye&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // ── Auto-refresco de datos cada 60s (igual que antes) ──────────────────
  useEffect(() => {
    let alive = true;
    const fetchData = () =>
      fetch(`/api/public/catalog/${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no'))))
        .then((d) => {
          if (!alive) return;
          setData(d); setError('');
          // Precarga las imágenes de las categorías presentes para evitar flicker.
          d.categories.forEach((c) => {
            const asset = getCategoryAsset(c.name);
            if (asset.image) { const img = new Image(); img.src = asset.image; }
          });
        })
        .catch(() => { if (alive && !data) setError('Cartelera no encontrada'); });
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [slug]);

  const slides = useMemo(() => (data ? construirSlides(data.categories) : []), [data]);

  // ── Rotación automática de slides cada 8s ──────────────────────────────
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => setCurrent((s) => (s + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  // Si cambian los datos y el índice queda fuera de rango, lo reseteo.
  useEffect(() => { if (current >= slides.length) setCurrent(0); }, [slides.length, current]);

  // ── Escalado del lienzo 16:9 + ajuste interno por slide (igual que antes,
  //    recalculado también al cambiar de slide para que cada uno encaje) ──
  useLayoutEffect(() => {
    function fit() {
      const wrap = wrapRef.current; if (!wrap) return;
      setScale(Math.min(wrap.clientWidth / BASE_W, wrap.clientHeight / BASE_H));
      const body = bodyRef.current, cols = colsRef.current;
      if (body && cols) {
        const avail = body.clientHeight, need = cols.scrollHeight;
        setInnerScale(need > avail + 1 ? avail / need : 1);
      }
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [data, current]);

  if (error) return <Pantalla>{error}</Pantalla>;
  if (!data) return <Pantalla><span className="animate-pulse">Cargando cartelera…</span></Pantalla>;
  if (!slides.length) return <Pantalla>Sin productos publicados.</Pantalla>;

  const { business } = data;
  const slide = slides[Math.min(current, slides.length - 1)];
  const innerStyle = innerScale < 1
    ? { transform: `scale(${innerScale})`, transformOrigin: 'top left', width: `${100 / innerScale}%`, height: `${100 / innerScale}%` }
    : undefined;

  // QR que abre el chat de WhatsApp del negocio.
  const waDigits = (business.whatsapp || '').replace(/\D/g, '');
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=${encodeURIComponent('https://wa.me/' + waDigits)}&bgcolor=161616&color=ffffff&margin=4`;

  return (
    <div ref={wrapRef} className="w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* Keyframe de aparición entre slides (sin librerías externas). */}
      <style>{`@keyframes cartelFade{from{opacity:0}to{opacity:1}}.cartel-fade{animation:cartelFade .6s ease-in-out both}`}</style>

      {/* Lienzo fijo 16:9 escalado a la pantalla */}
      <div ref={boardRef}
        style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})`, transformOrigin: 'center center' }}
        className="bg-zinc-900 text-white flex flex-col shrink-0 shadow-2xl overflow-hidden">

        {/* HEADER (~80px): logo del negocio + Instagram */}
        <header className="bg-cartel px-8 py-4 flex items-center justify-between shrink-0">
          <Logo className="h-12" />
          {business.instagram && <span className="text-white/90 font-bold text-lg">{business.instagram}</span>}
        </header>

        {/* CONTENIDO DEL SLIDE (se remonta con key para animar la transición) */}
        <div ref={bodyRef} className="flex-1 overflow-hidden">
          <div key={current} ref={colsRef} className="cartel-fade w-full h-full" style={innerStyle}>
            {slide.layout === 'hero'
              ? <SlideHero cat={slide.cats[0]} />
              : <SlideColumnas cats={slide.cats} />}
          </div>
        </div>

        {/* FOOTER: dirección | dots de slide | QR de WhatsApp */}
        <footer className="bg-zinc-950 text-white/75 text-base px-8 py-3 flex items-center justify-between shrink-0">
          <span className="w-1/3 truncate text-white/80 text-base">{business.address || ''}</span>
          <span className="w-1/3 flex items-center justify-center gap-2">
            {slides.map((_, i) => (
              <span key={i} className={`rounded-full transition-all ${i === current ? 'w-3 h-3 bg-amber-400' : 'w-2.5 h-2.5 bg-white/30'}`} />
            ))}
          </span>
          <span className="w-1/3 flex justify-end">
            {business.whatsapp && (
              <span className="flex items-center gap-3">
                <img src={qrSrc} alt="QR WhatsApp" className="w-14 h-14 rounded-md" style={{ imageRendering: 'pixelated' }} />
                <span className="flex flex-col">
                  <span className="text-green-400 font-bold text-base leading-tight">WhatsApp</span>
                  <span className="text-white/70 text-sm">{business.whatsapp}</span>
                </span>
              </span>
            )}
          </span>
        </footer>
      </div>
    </div>
  );
}

// ── Slide HERO: foto de categoría a la izquierda (55%) + lista grande (45%) ──
// La imagen va LIMPIA: solo foto + overlay de gradiente (sin texto/emoji encima).
function SlideHero({ cat }) {
  const asset = getCategoryAsset(cat.name);
  const max = maxPrecio(cat.items);
  return (
    <div className="h-full flex">
      {/* Izquierda: foto limpia con overlay en gradiente para profundidad */}
      <div className={`relative w-[55%] h-full overflow-hidden bg-gradient-to-br ${asset.gradient}`}>
        {asset.image && (
          <img src={asset.image} alt={cat.name}
            className="absolute inset-0 w-full h-full object-cover object-center"
            loading="eager" fetchpriority="high"
            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      </div>

      {/* Derecha: logo + lista de precios grande */}
      <div className="w-[45%] h-full px-8 py-6 flex flex-col justify-center">
        <div className="flex justify-end mb-3"><Logo className="h-14" /></div>
        <ul>
          {cat.items.map((p, i) => (
            <li key={i} className="flex items-baseline gap-3 py-2.5 border-b border-white/10 last:border-0">
              <span className="font-semibold text-white text-lg leading-snug">{p.name}</span>
              <span className="flex-1 border-b border-dotted border-white/25 translate-y-[-4px]" />
              <span className={`font-black text-amber-400 text-3xl tabular-nums whitespace-nowrap ${p.price === max ? 'animate-pulse' : ''}`}
                style={p.price === max ? RYE : undefined}>
                {money(p.price)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Slide de COLUMNAS: una o varias categorías repartidas a lo ancho ──────
function SlideColumnas({ cats }) {
  // Una sola categoría grande (p.ej. BEBIDAS): logo + título + items en 2 columnas.
  if (cats.length === 1) {
    const c = cats[0];
    const asset = getCategoryAsset(c.name);
    const max = maxPrecio(c.items);
    const mitad = Math.ceil(c.items.length / 2);
    const columnas = [c.items.slice(0, mitad), c.items.slice(mitad)];
    return (
      <div className="h-full px-10 py-5 flex flex-col">
        <div className="flex justify-end"><Logo className="h-10" /></div>
        <h2 className="relative flex items-center justify-center gap-3 text-amber-400 font-black text-4xl uppercase tracking-wide mb-5 overflow-hidden">
          {asset.image && (
            <span className="absolute inset-0 opacity-10" style={{ backgroundImage: `url(${asset.image})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(2px)' }} />
          )}
          <span className="relative z-10">{asset.emoji}</span>
          <span className="relative z-10" style={RYE}>{c.name}</span>
        </h2>
        <div className="flex-1 flex gap-12">
          {columnas.map((items, ci) => (
            <ul key={ci} className="flex-1">
              {items.map((p, i) => (
                <li key={i} className="flex items-baseline gap-3 py-2.5 border-b border-white/10">
                  <span className="font-semibold text-white text-lg leading-snug">{p.name}</span>
                  <span className="flex-1 border-b border-dotted border-white/25 translate-y-[-4px]" />
                  <span className={`font-black text-amber-400 text-2xl tabular-nums whitespace-nowrap ${p.price === max ? 'animate-pulse' : ''}`}
                    style={p.price === max ? RYE : undefined}>
                    {money(p.price)}
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    );
  }

  // Varias categorías: logo arriba + columnas (cada bloque = categoría).
  const columnas = distribuirColumnas(cats, Math.min(3, cats.length));
  return (
    <div className="h-full px-10 py-5 flex flex-col">
      <div className="flex justify-end mb-1"><Logo className="h-10" /></div>
      <div className="flex-1 flex gap-10 items-start">
        {columnas.map((col, ci) => (
          <div key={ci} className="flex-1 min-w-0">
            {col.map((c) => <BloqueCategoria key={c.name} cat={c} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function BloqueCategoria({ cat }) {
  const asset = getCategoryAsset(cat.name);
  const max = maxPrecio(cat.items);
  return (
    <section className="mb-5">
      <h2 className="relative flex items-center gap-2 text-amber-400 font-black text-2xl uppercase tracking-wide border-b-2 border-white/15 pb-1 mb-2 overflow-hidden">
        {asset.image && (
          <span className="absolute inset-0 opacity-10" style={{ backgroundImage: `url(${asset.image})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(2px)' }} />
        )}
        <span className="relative z-10">{asset.emoji}</span>
        <span className="relative z-10" style={RYE}>{cat.name}</span>
      </h2>
      <ul>
        {cat.items.map((p, i) => (
          <li key={i} className="flex items-baseline gap-2 py-1 border-b border-white/10 last:border-0">
            <span className="font-semibold text-white text-base leading-tight">{p.name}</span>
            <span className="flex-1 border-b border-dotted border-white/20 translate-y-[-3px]" />
            <span className={`font-black text-amber-400 text-xl tabular-nums whitespace-nowrap ${p.price === max ? 'animate-pulse' : ''}`}
              style={p.price === max ? RYE : undefined}>
              {money(p.price)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Pantalla completa para estados de carga/error.
function Pantalla({ children }) {
  return (
    <div className="w-screen h-screen bg-zinc-950 text-white flex items-center justify-center">
      <p className="text-2xl font-bold opacity-70">{children}</p>
    </div>
  );
}
