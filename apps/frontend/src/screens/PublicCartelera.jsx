import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getCategoryAsset } from '../lib/categoryAssets.js';

// ============================================================
// Cartelera pública "digital menuboard" 16:9 para TV. Rediseño TDAH-friendly:
// UN foco por slide, pocos ítems, jerarquía brutal (precio enorme) y estrategias
// de marketing (combo destacado, "el más pedido", cross-sell, promo, QR fuerte).
// Mantiene: lienzo 1280×720 autoescalado, rotación 8s, refresco 60s, QR WhatsApp.
//   /cartelera/:slug  |  /tv/:slug
// ============================================================
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const BASE_W = 1280, BASE_H = 720;
const SLIDE_MS = 8000;
const MAX_ITEMS = 5;                 // ≤5 ítems por slide (anti sobrecarga / Hick's law)
const RYE = { fontFamily: "'Rye', serif" };
// 👉 Promo opcional. Deja '' para ocultar la cinta. Ej: 'SOLO HOY 2x1 EN PAPAS'.
const PROMO = '';

function Logo({ className = 'h-10' }) {
  return (
    <img src="/logo.jpeg" alt="El Cartel de los Pollos"
      className={`${className} w-auto object-contain rounded-md`}
      style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.8))' }} />
  );
}

function Ribbon() {
  if (!PROMO) return null;
  return (
    <div className="absolute top-7 -left-14 rotate-[-45deg] z-20 bg-red-600 text-white font-black text-lg tracking-wide px-16 py-1.5 shadow-xl">
      {PROMO}
    </div>
  );
}

const num = (n) => Number(n) || 0;
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

// Orden de marketing: combos primero (mayor ticket), luego estrella y complementos.
const ORDER = ['COMBOS', 'COMBO', 'POLLO', 'PAPAS', 'COLACIONES', 'SNACKS', 'BEBIDAS'];
const ordIdx = (n) => { const i = ORDER.indexOf(n.toUpperCase()); return i === -1 ? 99 : i; };

// Línea de cross-sell/upsell según la categoría y los precios mínimos disponibles.
function crossSell(catName, min) {
  const u = catName.toUpperCase();
  if (u === 'POLLO' && min.PAPAS) return `+ Papas desde ${money(min.PAPAS)} 🍟`;
  if (u === 'COMBOS' || u === 'COMBO') return 'Pollo + papas en un solo combo 💥';
  const c = min.COMBOS || min.COMBO;
  return c ? `¿Hambre? Combo desde ${money(c)} 🔥` : null;
}

// Construye la lista plana de slides (1 foco c/u).
function construirSlides(categories) {
  const cats = [...categories].filter((c) => c.items?.length).sort((a, b) => ordIdx(a.name) - ordIdx(b.name) || a.name.localeCompare(b.name));
  const min = {}; for (const c of cats) min[c.name.toUpperCase()] = Math.min(...c.items.map((i) => num(i.price)));

  const slides = [];
  // 1) COMBO DESTACADO: el combo más caro (anclaje de precio + foco único).
  const pool = cats.filter((c) => ['COMBOS', 'COMBO'].includes(c.name.toUpperCase()));
  const src = pool.length ? pool : cats;
  let best = null, bestCat = null;
  for (const c of src) for (const it of c.items) if (!best || num(it.price) > num(best.price)) { best = it; bestCat = c; }
  if (best) slides.push({ type: 'featured', item: best, cat: bestCat, cs: crossSell(bestCat.name, min) });

  // 2) Un slide por categoría, troceado a ≤5 ítems.
  for (const c of cats) {
    const parts = chunk(c.items, MAX_ITEMS);
    parts.forEach((items, idx) => slides.push({ type: 'cat', cat: c, items, part: idx + 1, parts: parts.length, cs: crossSell(c.name, min) }));
  }
  return slides;
}

export default function PublicCartelera({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(0);

  const wrapRef = useRef(null);
  const bodyRef = useRef(null);
  const colsRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [innerScale, setInnerScale] = useState(1);

  // Fuente western 'Rye'
  useEffect(() => {
    if (!document.getElementById('rye-font')) {
      const link = document.createElement('link');
      link.id = 'rye-font'; link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Rye&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // Auto-refresco de datos cada 60s (igual que antes)
  useEffect(() => {
    let alive = true;
    const fetchData = () =>
      fetch(`/api/public/catalog/${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no'))))
        .then((d) => {
          if (!alive) return;
          setData(d); setError('');
          d.categories.forEach((c) => { const a = getCategoryAsset(c.name); if (a.image) { const img = new Image(); img.src = a.image; } });
        })
        .catch(() => { if (alive && !data) setError('Cartelera no encontrada'); });
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [slug]);

  const slides = useMemo(() => (data ? construirSlides(data.categories) : []), [data]);

  // Rotación automática cada 8s
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => setCurrent((s) => (s + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [slides.length]);
  useEffect(() => { if (current >= slides.length) setCurrent(0); }, [slides.length, current]);

  // Escalado del lienzo 16:9 + ajuste interno por slide (igual que antes)
  useLayoutEffect(() => {
    function fit() {
      const wrap = wrapRef.current; if (!wrap) return;
      setScale(Math.min(wrap.clientWidth / BASE_W, wrap.clientHeight / BASE_H));
      const body = bodyRef.current, cols = colsRef.current;
      if (body && cols) { const avail = body.clientHeight, need = cols.scrollHeight; setInnerScale(need > avail + 1 ? avail / need : 1); }
    }
    fit(); window.addEventListener('resize', fit);
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

  const waDigits = (business.whatsapp || '').replace(/\D/g, '');
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent('https://wa.me/' + waDigits)}&bgcolor=ffffff&color=0a0a0a&margin=4`;

  return (
    <div ref={wrapRef} className="w-screen h-screen bg-black overflow-hidden flex items-center justify-center">
      <style>{`@keyframes cartelFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.cartel-fade{animation:cartelFade .55s ease-out both}@keyframes cartelBar{from{width:0}to{width:100%}}@keyframes ringPulse{0%,100%{box-shadow:0 0 0 0 rgba(74,222,128,.7)}50%{box-shadow:0 0 0 10px rgba(74,222,128,0)}}`}</style>

      <div style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})`, transformOrigin: 'center center' }}
        className="bg-zinc-900 text-white flex flex-col shrink-0 shadow-2xl overflow-hidden">

        {/* HEADER */}
        <header className="bg-cartel px-8 py-4 flex items-center justify-between shrink-0">
          <Logo className="h-20" />
          {business.instagram && <span className="text-white font-black text-3xl tracking-tight">{business.instagram}</span>}
        </header>

        {/* CONTENIDO (1 foco por slide) */}
        <div ref={bodyRef} className="flex-1 overflow-hidden">
          <div key={current} ref={colsRef} className="cartel-fade w-full h-full" style={innerStyle}>
            {slide.type === 'featured' ? <SlideFeatured slide={slide} /> : <SlideCategoria slide={slide} />}
          </div>
        </div>

        {/* BARRA DE PROGRESO del slide (ritmo predecible) */}
        <div className="h-1.5 bg-white/10 shrink-0">
          <div key={current} className="h-full bg-amber-400" style={{ animation: `cartelBar ${SLIDE_MS}ms linear forwards` }} />
        </div>

        {/* FOOTER: dirección | dots | CTA QR fuerte */}
        <footer className="bg-zinc-950 px-8 py-3 flex items-center justify-between shrink-0">
          <span className="w-1/3 truncate text-white/70 text-base">{business.address || ''}</span>
          <span className="w-1/3 flex items-center justify-center gap-2">
            {slides.map((_, i) => (
              <span key={i} className={`rounded-full transition-all ${i === current ? 'w-3 h-3 bg-amber-400' : 'w-2 h-2 bg-white/25'}`} />
            ))}
          </span>
          <span className="w-1/3 flex justify-end">
            {business.whatsapp && (
              <span className="flex items-center gap-4">
                <span className="text-right">
                  <span className="block text-green-400 font-black text-3xl leading-tight">Escanea y pide 📲</span>
                  <span className="block text-white font-black text-2xl tabular-nums">WhatsApp · {business.whatsapp}</span>
                </span>
                <img src={qrSrc} alt="QR WhatsApp" className="w-28 h-28 rounded-lg bg-white p-1" style={{ imageRendering: 'pixelated', animation: 'ringPulse 2.5s ease-in-out infinite' }} />
              </span>
            )}
          </span>
        </footer>
      </div>
    </div>
  );
}

// ── Slide COMBO DESTACADO: un solo producto, foto a sangre, precio gigante ──
function SlideFeatured({ slide }) {
  const { item, cat, cs } = slide;
  const asset = getCategoryAsset(cat.name);
  return (
    <div className="relative h-full overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${asset.gradient}`} />
      {asset.image && (
        <img src={asset.image} alt={item.name} className="absolute inset-0 w-full h-full object-cover object-center"
          loading="eager" fetchpriority="high" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/20" />
      <Ribbon />
      <div className="relative h-full flex flex-col justify-center px-14">
        <span className="self-start inline-flex items-center gap-2 bg-amber-400 text-zinc-900 font-black text-2xl px-5 py-2 rounded-full mb-4 animate-pulse">🔥 COMBO DESTACADO</span>
        <div className="text-white font-black uppercase tracking-tight leading-[0.95] max-w-[60%] line-clamp-3 drop-shadow-lg" style={{ ...RYE, fontSize: 62 }}>{item.name}</div>
        <div className="text-amber-400 font-black tabular-nums mt-2 drop-shadow-lg" style={{ ...RYE, fontSize: 128, lineHeight: 1 }}>{money(item.price)}</div>
        {cs && <div className="text-amber-200 font-bold text-3xl mt-4">{cs}</div>}
      </div>
    </div>
  );
}

// ── Slide de CATEGORÍA: foto (52%) + ≤5 ítems grandes (48%), 1 destacado ──
function SlideCategoria({ slide }) {
  const { cat, items, part, parts, cs } = slide;
  const asset = getCategoryAsset(cat.name);
  const max = Math.max(...items.map((i) => num(i.price)));
  return (
    <div className="h-full flex">
      {/* Foto + identidad de categoría */}
      <div className={`relative w-[52%] h-full overflow-hidden bg-gradient-to-br ${asset.gradient}`}>
        {asset.image && (
          <img src={asset.image} alt={cat.name} className="absolute inset-0 w-full h-full object-cover object-center"
            loading="eager" fetchpriority="high" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/35" />
        <Ribbon />
        <div className="absolute left-8 right-8 bottom-7">
          <div className="leading-none drop-shadow-lg" style={{ fontSize: 64 }}>{asset.emoji}</div>
          <div className="text-white font-black uppercase tracking-tight leading-none mt-1 drop-shadow-lg" style={{ ...RYE, fontSize: 60 }}>{cat.name}</div>
          {parts > 1 && <div className="text-white/70 font-bold text-lg mt-1">{part} / {parts}</div>}
        </div>
      </div>

      {/* Lista grande (≤5) */}
      <div className="w-[48%] h-full px-8 py-6 flex flex-col justify-center">
        <ul className="space-y-2.5">
          {items.map((p, i) => {
            const hot = num(p.price) === max && items.length > 1;
            return (
              <li key={i} className={`relative rounded-2xl px-4 py-3 flex items-center gap-3 ${hot ? 'bg-white/10 ring-2 ring-amber-400' : ''}`}>
                {hot && <span className="absolute -top-3 left-4 bg-amber-400 text-zinc-900 font-black text-xs px-3 py-1 rounded-full shadow">⭐ EL MÁS PEDIDO</span>}
                <span className="flex-1 min-w-0 font-bold text-white text-2xl leading-tight line-clamp-2">{p.name}</span>
                <span className={`font-black text-amber-400 tabular-nums whitespace-nowrap ${hot ? 'text-5xl animate-pulse' : 'text-4xl'}`} style={RYE}>{money(p.price)}</span>
              </li>
            );
          })}
        </ul>
        {cs && <div className="mt-5 text-center text-amber-300 font-bold text-2xl">{cs}</div>}
      </div>
    </div>
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
