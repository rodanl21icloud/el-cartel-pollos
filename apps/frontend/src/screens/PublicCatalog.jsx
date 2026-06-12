import { useEffect, useMemo, useState } from 'react';
import { BRAND_LOGO } from '../config/brand.js';

// Página PÚBLICA del catálogo (sin login). La abren los clientes desde el link
// compartible /catalogo/:slug. Permite armar un pedido y enviarlo por WhatsApp
// según las formas de entrega habilitadas (retiro / domicilio).
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

export default function PublicCatalog({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [cart, setCart] = useState({}); // { name: { qty, price } }
  const [method, setMethod] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [quote, setQuote] = useState(null);   // { ok, fee, km, eta, message }
  const [quoting, setQuoting] = useState(false);

  useEffect(() => {
    fetch(`/api/public/catalog/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no'))))
      .then((d) => { setData(d); setMethod(d.delivery.delivery ? 'domicilio' : (d.delivery.pickup ? 'retiro' : null)); })
      .catch(() => setError('Catálogo no encontrado'));
  }, [slug]);

  const items = useMemo(() => Object.entries(cart).filter(([, v]) => v.qty > 0), [cart]);
  const total = items.reduce((s, [, v]) => s + v.qty * v.price, 0);
  const count = items.reduce((s, [, v]) => s + v.qty, 0);
  const add = (name, price, d) => setCart((c) => ({ ...c, [name]: { price, qty: Math.max(0, (c[name]?.qty || 0) + d) } }));

  // Combo destacado ("el más pedido") y su upsell con bebida 1.5L (matching por nombre).
  const [showUpsell, setShowUpsell] = useState(false);
  const featured = useMemo(() => data?.categories.flatMap((c) => c.items)
    .find((p) => { const s = p.name.toUpperCase(); return s.includes('PAPAS 500') && !s.includes('BEBIDA') && !s.includes('400'); }) || null, [data]);
  const upsellTarget = useMemo(() => data?.categories.flatMap((c) => c.items)
    .find((p) => { const s = p.name.toUpperCase(); return s.includes('PAPAS 500') && s.includes('BEBIDA'); }) || null, [data]);

  // Cotiza el despacho (distancia de conducción) al cambiar la dirección (debounce).
  useEffect(() => {
    if (method !== 'domicilio' || address.trim().length < 6) { setQuote(null); return; }
    setQuoting(true);
    const t = setTimeout(() => {
      fetch(`/api/public/delivery-quote?address=${encodeURIComponent(address.trim())}`)
        .then((r) => r.json()).then(setQuote)
        .catch(() => setQuote({ ok: false, message: 'No se pudo calcular el envío. Coordina por WhatsApp.' }))
        .finally(() => setQuoting(false));
    }, 700);
    return () => clearTimeout(t);
  }, [address, method]);

  if (error) return <Centered>{error}</Centered>;
  if (!data) return <Centered><span className="animate-pulse">Cargando catálogo…</span></Centered>;

  const { business, delivery, categories } = data;

  const fee = method === 'domicilio' && quote?.ok ? quote.fee : 0;
  const finalTotal = total + fee;
  // Solo bloquea si la dirección está FUERA DE ZONA. Si el cálculo no está
  // disponible (sin API key / no geolocaliza), se permite pedir y coordinar envío.
  const blocked = method === 'domicilio' && quote?.reason === 'fuera_zona';
  const canOrder = !!name.trim() && !!phone.trim() && (method !== 'domicilio' || !!address.trim()) && !blocked;

  function pedir() {
    if (!canOrder) return;
    const L = items.map(([n, v]) => `• ${v.qty}× ${n} — ${money(v.qty * v.price)}`).join('\n');
    let t = `Hola 👋 quiero un pedido en ${business.name}:\n${L}\n\nSubtotal: ${money(total)}`;
    if (fee) t += `\nEnvío: ${money(fee)}${quote?.km ? ` (${quote.km} km)` : ''}`;
    else if (method === 'domicilio') t += `\nEnvío: por confirmar`;
    t += `\n*Total: ${money(finalTotal)}${method === 'domicilio' && !fee ? ' + envío' : ''}*\n\nEntrega: ${method === 'retiro' ? 'Retiro en tienda' : 'Despacho a domicilio'}\nNombre: ${name}\nTeléfono: ${phone}`;
    if (method === 'domicilio') t += `\nDirección: ${address}`;
    const to = (business.whatsapp || '').replace(/\D/g, '');
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(t)}`, '_blank');
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-28">
      {/* Encabezado del negocio */}
      <header className="bg-ink text-white">
        <div className="max-w-2xl mx-auto px-4 py-6 flex items-center gap-4">
          <img src={BRAND_LOGO} alt="" className="w-16 h-16 rounded-xl bg-white object-contain p-1" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="min-w-0">
            <h1 className="text-2xl font-black truncate">{business.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {delivery.pickup && <Badge>🏠 Retiro en tienda</Badge>}
              {delivery.delivery && <Badge>🛵 Despacho a domicilio</Badge>}
            </div>
            {business.instagram && <p className="text-sm text-slate-300 mt-2">{business.instagram}</p>}
          </div>
        </div>
      </header>

      {/* Productos por categoría */}
      <main className="max-w-2xl mx-auto px-4 py-5 space-y-7">
        {categories.length === 0 && <p className="text-center text-slate-400 mt-10">Aún no hay productos publicados.</p>}
        {categories.map((cat) => {
          // En "Combos", el destacado va primero para máxima visibilidad.
          const list = cat.name === 'COMBOS' && featured
            ? [featured, ...cat.items.filter((p) => p.name !== featured.name)]
            : cat.items;
          return (
          <section key={cat.name}>
            <h2 className="font-black text-lg text-slate-800 mb-2">{cat.name.charAt(0) + cat.name.slice(1).toLowerCase()}</h2>
            <div className="space-y-2">
              {list.map((p) => {
                const qty = cart[p.name]?.qty || 0;
                const star = featured && p.name === featured.name;
                return (
                  <div key={p.name} className={`bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3 ${star ? 'ring-2 ring-cartel relative mt-3' : ''}`}>
                    {star && <span className="absolute -top-2.5 left-3 bg-cartel text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow">🔥 EL MÁS PEDIDO</span>}
                    {p.image_url
                      ? <img src={p.image_url} alt="" className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                      : <div className="w-16 h-16 rounded-xl bg-slate-100 grid place-items-center text-2xl shrink-0">🍗</div>}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-800 leading-tight">{p.name}</div>
                      {p.description && <div className="text-xs text-slate-500 line-clamp-2">{p.description}</div>}
                      <div className="font-black text-cartel mt-0.5">{money(p.price)}</div>
                    </div>
                    {qty > 0 ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <Stepper onClick={() => add(p.name, p.price, -1)}>−</Stepper>
                        <span className="w-6 text-center font-black tabular-nums">{qty}</span>
                        <Stepper onClick={() => add(p.name, p.price, +1)}>+</Stepper>
                      </div>
                    ) : (
                      <button onClick={() => { add(p.name, p.price, +1); if (star && upsellTarget) setShowUpsell(true); }}
                        className="shrink-0 px-4 py-2 rounded-xl bg-cartel text-white font-bold text-sm">Agregar</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          );
        })}
        <p className="text-center text-xs text-slate-400 pt-2">
          {business.phone && <>📞 {business.phone} · </>}Catálogo de {business.name}
        </p>
      </main>

      {/* Checkout: método, datos del cliente, envío y total en tiempo real */}
      {count > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,.08)] max-h-[72vh] overflow-y-auto">
          <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
            <div className="flex gap-2">
              {delivery.pickup && <Chip active={method === 'retiro'} onClick={() => setMethod('retiro')}>🏠 Retiro</Chip>}
              {delivery.delivery && <Chip active={method === 'domicilio'} onClick={() => setMethod('domicilio')}>🛵 Delivery</Chip>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="field" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono" inputMode="tel" className="field" />
            </div>
            {method === 'domicilio' && (
              <>
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección exacta (calle, número, comuna)" className="field w-full" />
                {quoting && <p className="text-xs text-slate-400">Calculando envío…</p>}
                {!quoting && quote && !quote.ok && <p className="text-xs text-cartel font-bold">⚠️ {quote.message}</p>}
                {!quoting && quote?.ok && <p className="text-xs text-green-600 font-bold">✓ A {quote.km} km · envío {money(quote.fee)}{quote.eta ? ` · ~${quote.eta}` : ''}</p>}
              </>
            )}
            <div className="text-sm border-t pt-2 space-y-0.5">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{money(total)}</span></div>
              {fee > 0 && <div className="flex justify-between text-slate-500"><span>Envío</span><span>{money(fee)}</span></div>}
              <div className="flex justify-between font-black text-base text-slate-800"><span>Total</span><span>{money(finalTotal)}</span></div>
            </div>
            <button onClick={pedir} disabled={!canOrder}
              className="w-full py-3 rounded-2xl bg-green-600 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50">
              <Wa /> Pedir por WhatsApp · {money(finalTotal)}
            </button>
          </div>
        </div>
      )}

      {/* Upsell: al agregar el combo destacado, sugerir el combo con bebida 1.5L */}
      {showUpsell && featured && upsellTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setShowUpsell(false)}>
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl">🥤</div>
            <h3 className="font-black text-xl mt-2 text-slate-800">¿Con sed?</h3>
            <p className="text-slate-600 mt-1">Por solo <b className="text-cartel">{money(upsellTarget.price - featured.price)} adicionales</b> llévate el combo <b>con bebida de 1.5L</b>.</p>
            <button onClick={() => { add(featured.name, featured.price, -1); add(upsellTarget.name, upsellTarget.price, +1); setShowUpsell(false); }}
              className="w-full mt-4 py-3 rounded-2xl bg-cartel text-white font-black active:scale-95">Sí, agregar bebida 🍻</button>
            <button onClick={() => setShowUpsell(false)} className="w-full mt-2 py-2 text-slate-500 font-bold text-sm">No, gracias</button>
          </div>
        </div>
      )}

      {/* WhatsApp flotante persistente (siempre visible en el scroll) */}
      <a href={`https://wa.me/${(business.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
        aria-label="Escríbenos por WhatsApp"
        className={`fixed right-4 bottom-5 z-40 w-14 h-14 rounded-full bg-green-500 text-white grid place-items-center shadow-lg active:scale-95 transition-all ${count > 0 ? 'hidden' : ''}`}>
        <Wa />
      </a>
    </div>
  );
}

const Centered = ({ children }) => <div className="min-h-screen grid place-items-center bg-slate-100 text-slate-500 font-semibold p-6 text-center">{children}</div>;
const Badge = ({ children }) => <span className="text-xs font-bold bg-white/15 px-2.5 py-1 rounded-full">{children}</span>;
const Stepper = ({ children, onClick }) => <button onClick={onClick} className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 font-black text-lg grid place-items-center active:scale-95">{children}</button>;
const Chip = ({ active, children, onClick }) => <button onClick={onClick} className={`flex-1 py-2 rounded-xl font-bold text-sm ${active ? 'bg-ink text-white' : 'bg-slate-100 text-slate-600'}`}>{children}</button>;
const Wa = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.477-.957zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>;
