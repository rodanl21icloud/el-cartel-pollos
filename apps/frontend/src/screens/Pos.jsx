import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { esNombreInvalido } from '../lib/productName.js';
import { recordSale, flushQueue } from '../lib/offlineStore.js';
import { buildCustomerReceiptHTML, buildKitchenTicketHTML, whatsappUrl } from '../lib/receipt.js';
import { openPrint } from '../lib/print.js'; import { getCategoryAsset } from '../lib/categoryAssets.js';
import AbrirCajaModal from '../components/AbrirCajaModal.jsx';

const PAYMENTS = [
  { id: 'EFECTIVO', label: '💵 Efectivo', color: 'bg-green-600' },
  { id: 'POS', label: '💳 POS', color: 'bg-blue-600' },
  { id: 'TRANSFERENCIA', label: '📲 Transferencia', color: 'bg-purple-600' },
];

const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const CAT_ORDER = ['POLLO', 'COMBOS', 'COLACIONES', 'PAPAS', 'SNACKS', 'BEBIDAS'];

// Contenedor del POS: exige caja abierta y ofrece Venta de productos / Venta libre.
export default function Pos({ onNavigate }) {
  const [caja, setCaja] = useState(null);   // null=cargando, {open}
  const [mode, setMode] = useState('choose'); // choose | productos | libre
  const [settings, setSettings] = useState({ name: 'El Cartel de los Pollos', paper_width: 80 });
  const [lastSale, setLastSale] = useState(null);
  const [showApertura, setShowApertura] = useState(true); // KAN-31: pedir fondo al entrar con caja cerrada

  async function loadCaja() {
    try { setCaja(await api('/cash-register/current')); } catch { setCaja({ open: false }); }
  }
  useEffect(() => { loadCaja(); }, []);
  useEffect(() => { api('/settings').then(setSettings).catch(() => {}); }, []);
  useEffect(() => { flushQueue(); }, []);

  if (caja === null) return <p className="text-zinc-500 text-center mt-10">Cargando…</p>;

  // Caja cerrada -> no se puede vender. Se exige abrir la caja declarando el fondo
  // (KAN-31: el modal aparece al entrar; "Cancelar" deja el acceso bloqueado).
  if (!caja.open) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-2xl p-8 shadow text-center mt-6">
        <div className="text-5xl mb-2">🔒</div>
        <h2 className="text-2xl font-black mb-1">Caja cerrada</h2>
        <p className="text-zinc-500 mb-5">Debes abrir la caja antes de registrar ventas.</p>
        <button onClick={() => setShowApertura(true)} className="btn-pos bg-cartel text-white w-full">
          Abrir caja
        </button>
        {showApertura && (
          <AbrirCajaModal
            onOpened={() => { setShowApertura(false); loadCaja(); }}
            onCancel={() => setShowApertura(false)}
          />
        )}
      </div>
    );
  }

  const onSold = (data) => setLastSale(data);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Barra superior con estado de caja */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {mode !== 'choose' && (
            <button onClick={() => setMode('choose')} className="px-3 py-2 rounded-lg bg-zinc-200 font-bold">← Volver</button>
          )}
          <span className="text-xs px-3 py-1 rounded-full bg-green-600 text-white font-bold">CAJA ABIERTA · fondo {money(caja.opening_float)}</span>
        </div>
      </div>

      {mode === 'choose' && <SaleChooser onPick={setMode} />}
      {mode === 'productos' && <ProductSale settings={settings} onSold={onSold} />}
      {mode === 'libre' && <VentaLibre settings={settings} onSold={onSold} />}

      {lastSale && (
        <ReceiptPanel data={lastSale} settings={settings} onClose={() => setLastSale(null)} />
      )}
    </div>
  );
}

// --- Elegir tipo de venta (estilo "Nueva venta" de Treinta) ---
function SaleChooser({ onPick }) {
  const Card = ({ icon, title, desc, onClick }) => (
    <button onClick={onClick}
      className="bg-white rounded-2xl p-6 shadow text-left hover:border-cartel border-2 border-transparent transition flex gap-4 items-start">
      <div className="text-4xl">{icon}</div>
      <div>
        <div className="text-xl font-black">{title}</div>
        <div className="text-zinc-500 text-sm mt-1">{desc}</div>
      </div>
    </button>
  );
  return (
    <div className="max-w-2xl mx-auto grid sm:grid-cols-2 gap-4 mt-4">
      <Card icon="🛒" title="Venta de productos" onClick={() => onPick('productos')}
        desc="Registra una venta seleccionando los productos de tu carta." />
      <Card icon="🧾" title="Venta libre" onClick={() => onPick('libre')}
        desc="Registra un ingreso por un monto, sin seleccionar productos." />
    </div>
  );
}

// --- Venta de productos (catálogo + carrito con modificadores + confirmación) ---
let _uid = 0;
function ProductSale({ onSold }) {
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([]); // [{ uid, productId, name, basePrice, qty, modifiers:[{id,name,price_delta}], modsTotal }]
  const [cat, setCat] = useState('TODO');
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [modalProduct, setModalProduct] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { api('/products').then(setProducts).catch(() => {}); }, []);

  const total = lines.reduce((s, l) => s + (l.basePrice + l.modsTotal) * l.qty, 0);
  const totalUnidades = lines.reduce((s, l) => s + l.qty, 0);
  const cats = CAT_ORDER.filter((c) => products.some((p) => p.category === c));
  const otras = [...new Set(products.map((p) => p.category))].filter((c) => !CAT_ORDER.includes(c));
  const tabs = ['TODO', ...cats, ...otras];
  const q = search.trim().toLowerCase();
  const visible = products.filter((p) => (cat === 'TODO' || p.category === cat) && (!q || p.name.toLowerCase().includes(q)));

  function qtyInCart(productId) { return lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0); }

  function tapProduct(p) {
    if (p.has_modifiers) { setModalProduct(p); return; }
    addLine(p, []);
  }
  function addLine(p, modifiers) {
    setLines((ls) => {
      // Sin modificadores: fusiona con una línea existente del mismo producto sin mods.
      if (!modifiers.length) {
        const i = ls.findIndex((l) => l.productId === p.id && l.modifiers.length === 0);
        if (i >= 0) { const x = [...ls]; x[i] = { ...x[i], qty: x[i].qty + 1 }; return x; }
      }
      const modsTotal = modifiers.reduce((s, m) => s + m.price_delta, 0);
      return [...ls, { uid: ++_uid, productId: p.id, name: p.name, basePrice: p.price, qty: 1, modifiers, modsTotal, note: '' }];
    });
  }
  function incLine(uid) { setLines((ls) => ls.map((l) => l.uid === uid ? { ...l, qty: l.qty + 1 } : l)); }
  function decLine(uid) { setLines((ls) => ls.flatMap((l) => l.uid === uid ? (l.qty <= 1 ? [] : [{ ...l, qty: l.qty - 1 }]) : [l])); }
  function setLineNote(uid, val) { setLines((ls) => ls.map((l) => l.uid === uid ? { ...l, note: val } : l)); }

  async function createSale(method, { discount = 0, client = null, deliveryFee = 0 } = {}) {
    if (!lines.length) return;
    const receiptItems = lines.map((l) => ({
      name: l.name, qty: l.qty, unit_price: l.basePrice, line_total: (l.basePrice + l.modsTotal) * l.qty,
      modifiers: l.modifiers.map((m) => ({ name: m.name, price_delta: m.price_delta })), note: l.note?.trim() || null,
    }));
    const soldAt = new Date().toISOString();
    const net = Math.max(0, total - discount) + deliveryFee;
    const payload = { client_uuid: crypto.randomUUID(), payment_method: method, sold_at: soldAt,
      items: lines.map((l) => ({ product_id: l.productId, qty: l.qty, modifier_option_ids: l.modifiers.map((m) => m.id), note: l.note?.trim() || undefined })) };
    if (discount > 0) payload.discount = discount;
    if (deliveryFee > 0) payload.delivery_fee = deliveryFee;
    if (client && (client.phone || client.name)) payload.client = client;
    const res = await recordSale(payload);
    setLines([]); setConfirming(false);
    const data = {
      order_number: res.order_number ?? null, items: receiptItems, total: net, discount, delivery_fee: deliveryFee,
      subtotal: total, payment_method: method, sold_at: soldAt, offline: !res.synced,
      client_name: client?.name, client_phone: client?.phone, delivery_address: client?.address,
    };
    onSold(data);
    if (!res.synced) { setToast('📴 Sin red: pedido en cola'); setTimeout(() => setToast(null), 3000); }
  }

  if (confirming) {
    const confLines = lines.map((l) => ({ name: l.name, price: l.basePrice + l.modsTotal, qty: l.qty, modifiers: l.modifiers }));
    return <PaymentConfirm lines={confLines} subtotal={total} onBack={() => setConfirming(false)} onCreate={createSale} />;
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…"
          className="w-full mb-2 px-4 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
          {tabs.map((t) => (
            <button key={t} onClick={() => setCat(t)}
              className={`px-4 py-2 rounded-full font-bold whitespace-nowrap ${cat === t ? 'bg-cartel text-white' : 'bg-white text-zinc-600 border border-zinc-200'}`}>
              {t === 'TODO' ? 'Todo' : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 p-1">
          {visible.map((p) => {
            const qc = qtyInCart(p.id);
            // KAN-28 (B): marca en amarillo si el nombre es de código/ inválido. Sigue siendo seleccionable.
            const asset = getCategoryAsset(p.category);             const invalido = esNombreInvalido(p.name);
            const aviso = 'Este producto tiene un nombre de código. Edítalo en Carta';
            return (
              <button key={p.id} onClick={() => tapProduct(p)} title={invalido ? aviso : undefined}
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
      </div>

      <div className="bg-white rounded-2xl p-4 shadow flex flex-col">
        <h2 className="font-black text-lg mb-2">Pedido {totalUnidades > 0 && <span className="text-sm text-zinc-400">({totalUnidades})</span>}</h2>
        <div className="flex-1 space-y-2 overflow-auto">
          {lines.map((l) => (
            <div key={l.uid} className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-sm">{l.name}</span>
                {l.modifiers.map((m, i) => (
                  <div key={i} className="text-xs text-zinc-500">› {m.name}{m.price_delta > 0 ? ` +${money(m.price_delta)}` : ''}</div>
                ))}
                <input value={l.note || ''} onChange={(e) => setLineNote(l.uid, e.target.value)} placeholder="Nota (ej: sin ají, bien cocido)"
                  className="mt-1 w-full text-xs px-2 py-1 rounded-lg border border-zinc-200 focus:border-cartel outline-none" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => decLine(l.uid)} className="w-8 h-8 rounded-lg bg-zinc-200 text-xl font-black">−</button>
                <span className="w-5 text-center font-bold">{l.qty}</span>
                <button onClick={() => incLine(l.uid)} className="w-8 h-8 rounded-lg bg-zinc-200 text-xl font-black">+</button>
              </div>
            </div>
          ))}
          {!lines.length && <p className="text-zinc-400">Toca productos para agregar.</p>}
        </div>
        <div className="border-t mt-3 pt-3">
          <div className="flex justify-between text-2xl font-black mb-3"><span>Total</span><span>{money(total)}</span></div>
          <button disabled={!lines.length} onClick={() => setConfirming(true)}
            className="btn-pos w-full bg-cartel text-white disabled:opacity-40">Cobrar →</button>
        </div>
      </div>

      {modalProduct && (
        <ModifierModal product={modalProduct}
          onCancel={() => setModalProduct(null)}
          onConfirm={(opts) => { addLine(modalProduct, opts); setModalProduct(null); }} />
      )}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>}
    </div>
  );
}

// Modal de selección de adiciones/modificadores al agregar un producto.
function ModifierModal({ product, onCancel, onConfirm }) {
  const [groups, setGroups] = useState(null);
  const [sel, setSel] = useState({}); // group_id -> Set(option_id)
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/products/${product.id}/modifiers`).then((g) => { setGroups(g); }).catch((e) => setError(e.message));
  }, [product.id]);

  function toggle(group, optId) {
    setSel((s) => {
      const cur = new Set(s[group.id] || []);
      const single = (group.max_select === 1);
      if (cur.has(optId)) cur.delete(optId);
      else {
        if (single) cur.clear();
        else if (group.max_select && cur.size >= group.max_select) return s; // tope
        cur.add(optId);
      }
      return { ...s, [group.id]: cur };
    });
  }

  function confirm() {
    // Validar requeridos / mínimos.
    for (const g of groups) {
      const n = (sel[g.id] || new Set()).size;
      if (g.is_required && n < Math.max(1, g.min_select)) { setError(`Elige en "${g.name}"`); return; }
      if (g.min_select && n < g.min_select) { setError(`Elige al menos ${g.min_select} en "${g.name}"`); return; }
    }
    const chosen = [];
    for (const g of groups) for (const oid of (sel[g.id] || [])) {
      const o = g.options.find((x) => x.id === oid);
      if (o) chosen.push({ id: o.id, name: o.name, price_delta: o.price_delta });
    }
    onConfirm(chosen);
  }

  const extra = groups ? groups.flatMap((g) => [...(sel[g.id] || [])].map((oid) => g.options.find((o) => o.id === oid)?.price_delta || 0)).reduce((s, n) => s + n, 0) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-30" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-1">{product.name}</h3>
        <p className="text-sm text-zinc-500 mb-3">{money(product.price)}{extra > 0 ? ` + ${money(extra)}` : ''}</p>
        {!groups ? <p className="text-zinc-400">Cargando opciones…</p> : groups.map((g) => (
          <div key={g.id} className="mb-4">
            <div className="font-bold mb-1">{g.name} {g.is_required && <span className="text-red-500 text-xs">*obligatorio</span>}
              <span className="text-xs text-zinc-400 font-normal"> ({g.max_select === 1 ? 'elige 1' : `máx ${g.max_select || '∞'}`})</span></div>
            <div className="grid grid-cols-2 gap-2">
              {g.options.map((o) => {
                const on = (sel[g.id] || new Set()).has(o.id);
                return (
                  <button key={o.id} onClick={() => toggle(g, o.id)}
                    className={`rounded-xl py-2 px-3 text-sm font-bold border-2 text-left ${on ? 'border-cartel bg-cartel/10' : 'border-zinc-200'}`}>
                    {o.name}{o.price_delta > 0 && <span className="block text-xs text-cartel">+{money(o.price_delta)}</span>}
                  </button>
                );
              })}
              {!g.options.length && <span className="text-zinc-400 text-sm">Sin opciones.</span>}
            </div>
          </div>
        ))}
        {error && <p className="text-red-600 font-semibold mb-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={confirm} className="flex-1 btn-pos bg-cartel text-white">Agregar {extra > 0 ? `(${money(product.price + extra)})` : ''}</button>
          <button onClick={onCancel} className="px-4 rounded-2xl bg-zinc-200 font-bold">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// --- Confirmación de la venta: productos + pago (estilo Treinta) ---
const PAY_CARDS = [
  { id: 'EFECTIVO', icon: '💵', label: 'Efectivo' },
  { id: 'POS', icon: '💳', label: 'Tarjeta' },
  { id: 'TRANSFERENCIA', icon: '🏦', label: 'Transferencia' },
];

function PaymentConfirm({ lines, subtotal, onBack, onCreate }) {
  const [method, setMethod] = useState('EFECTIVO');
  const [discPct, setDiscPct] = useState('');
  const [discAmt, setDiscAmt] = useState('');
  const [domicilio, setDomicilio] = useState(false);
  const [phone, setPhone] = useState('');
  const [cname, setCname] = useState('');
  const [address, setAddress] = useState('');
  const [fee, setFee] = useState('');
  const [found, setFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const discount = Math.min(Math.max(0, Number(discAmt) || 0), subtotal);
  const deliveryFee = domicilio ? Math.max(0, Number(fee) || 0) : 0;
  const net = Math.max(0, subtotal - discount) + deliveryFee;

  function changePct(v) {
    setDiscPct(v);
    const pct = Math.min(100, Math.max(0, Number(v) || 0));
    setDiscAmt(String(Math.round(subtotal * pct / 100)));
  }
  function changeAmt(v) {
    setDiscAmt(v);
    const amt = Math.min(subtotal, Math.max(0, Number(v) || 0));
    setDiscPct(subtotal > 0 ? String(Math.round(amt / subtotal * 100)) : '0');
  }

  // Buscar cliente por teléfono y autocompletar.
  async function lookupPhone() {
    if (!phone.trim()) return;
    try {
      const c = await api(`/clients?phone=${encodeURIComponent(phone.trim())}`);
      if (c && c.id) { setCname(c.name || ''); setAddress(c.address || ''); setFound(true); }
      else setFound(false);
    } catch { /* */ }
  }

  async function create() {
    setBusy(true);
    const client = domicilio && (phone.trim() || cname.trim())
      ? { phone: phone.trim(), name: cname.trim() || 'Cliente', address: address.trim() } : null;
    try { await onCreate(method, { discount, client, deliveryFee }); } finally { setBusy(false); }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
      {/* Productos */}
      <div>
        <button onClick={onBack} className="mb-3 px-3 py-2 rounded-lg bg-zinc-200 font-bold">← Volver al pedido</button>
        <div className="bg-white rounded-2xl p-4 shadow">
          <h2 className="font-black text-lg mb-3">Productos</h2>
          <ul className="divide-y">
            {lines.map((l, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-bold">{l.name}</div>
                  {(l.modifiers || []).map((m, k) => <div key={k} className="text-xs text-zinc-500">› {m.name}</div>)}
                  <div className="text-sm text-zinc-500">{l.qty} × {money(l.price)}</div>
                </div>
                <div className="font-bold">{money(l.price * l.qty)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Pago */}
      <div className="bg-white rounded-2xl p-5 shadow">
        <h2 className="font-black text-lg mb-3">Pago</h2>

        <label className="block font-bold text-zinc-700 mb-1">Descuento</label>
        <div className="flex items-center gap-2 mb-4">
          <div className="relative w-24">
            <input type="number" min="0" max="100" value={discPct} onChange={(e) => changePct(e.target.value)} placeholder="0"
              className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            <span className="absolute right-3 top-2 text-zinc-400">%</span>
          </div>
          <span className="text-zinc-400 font-bold">=</span>
          <div className="relative flex-1">
            <span className="absolute left-3 top-2 text-zinc-400">$</span>
            <input type="number" min="0" value={discAmt} onChange={(e) => changeAmt(e.target.value)} placeholder="0"
              className="w-full pl-7 pr-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
          </div>
        </div>

        {/* Cliente / Entrega */}
        <div className="flex items-center justify-between mb-2">
          <label className="font-bold text-zinc-700">Entrega a domicilio</label>
          <button onClick={() => setDomicilio(!domicilio)}
            className={`w-12 h-7 rounded-full transition relative ${domicilio ? 'bg-green-500' : 'bg-zinc-300'}`}>
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${domicilio ? 'left-[1.4rem]' : 'left-0.5'}`} />
          </button>
        </div>
        {domicilio && (
          <div className="space-y-2 mb-4 bg-zinc-50 rounded-xl p-3">
            <div className="flex gap-2">
              <input value={phone} onChange={(e) => { setPhone(e.target.value); setFound(false); }} onBlur={lookupPhone} placeholder="Teléfono"
                className="flex-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" inputMode="tel" />
              {found && <span className="text-green-600 text-xs self-center font-bold">✓ cliente</span>}
            </div>
            <input value={cname} onChange={(e) => setCname(e.target.value)} placeholder="Nombre del cliente"
              className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección de entrega"
              className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            <div className="relative">
              <span className="absolute left-3 top-2 text-zinc-400">$</span>
              <input type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Costo de envío"
                className="w-full pl-7 pr-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
            </div>
          </div>
        )}

        <label className="block font-bold text-zinc-700 mb-2">Método de pago</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {PAY_CARDS.map((m) => (
            <button key={m.id} onClick={() => setMethod(m.id)}
              className={`rounded-xl py-3 px-2 border-2 text-center relative ${method === m.id ? 'border-green-500 bg-green-50' : 'border-zinc-200'}`}>
              {method === m.id && <span className="absolute top-1 right-1 text-green-600 text-sm">✓</span>}
              <div className="text-2xl">{m.icon}</div>
              <div className="text-xs font-bold mt-1">{m.label}</div>
            </button>
          ))}
        </div>

        <div className="border-t pt-3 text-sm space-y-1 mb-4">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-red-600"><span>Descuento</span><span>− {money(discount)}</span></div>}
          {deliveryFee > 0 && <div className="flex justify-between"><span>Envío</span><span>{money(deliveryFee)}</span></div>}
          <div className="flex justify-between text-xl font-black pt-1"><span>Total</span><span>{money(net)}</span></div>
        </div>

        <button onClick={create} disabled={busy}
          className="btn-pos w-full bg-cartel text-white disabled:opacity-50 flex items-center justify-between px-6">
          <span>{busy ? 'Creando…' : 'Crear venta'}</span><span>{money(net)} →</span>
        </button>
      </div>
    </div>
  );
}

// --- Venta libre (ingreso por monto, sin productos) ---
function VentaLibre({ onSold }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function cobrar(method) {
    setError('');
    const amt = Number(amount);
    if (!(amt > 0)) return setError('Ingresa un monto válido');
    setBusy(true);
    const soldAt = new Date().toISOString();
    // Sin claves undefined: se perderían al serializar y romperían el hash HMAC.
    const payload = { client_uuid: crypto.randomUUID(), payment_method: method, sold_at: soldAt, free_amount: amt };
    if (note.trim()) payload.note = note.trim();
    try {
      const res = await recordSale(payload);
      const data = { order_number: res.order_number ?? null, total: amt, payment_method: method, sold_at: soldAt,
        items: [{ name: note.trim() || 'Venta libre', qty: 1, line_total: amt }], offline: !res.synced };
      setAmount(''); setNote('');
      onSold(data);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl p-6 shadow">
      <h2 className="text-2xl font-black mb-1">Venta libre</h2>
      <p className="text-zinc-500 text-sm mb-4">Registra un ingreso por un monto, sin descontar inventario.</p>
      <label className="block font-bold text-zinc-700 mb-1">Monto</label>
      <input type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
        className="w-full mb-4 px-4 py-4 text-3xl rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <label className="block font-bold text-zinc-700 mb-1">Descripción (opcional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: producto fuera de carta"
        className="w-full mb-4 px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}
      <div className="grid gap-2">
        {PAYMENTS.map((m) => (
          <button key={m.id} disabled={busy} onClick={() => cobrar(m.id)}
            className={`btn-pos text-white disabled:opacity-40 ${m.color}`}>{m.label}</button>
        ))}
      </div>
    </div>
  );
}

// Panel post-venta: número de orden + acciones de comprobante.
function ReceiptPanel({ data, settings, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-30" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm text-zinc-500">Venta registrada</div>
        <div className="text-6xl font-black text-cartel my-1">{data.offline ? '⏳' : `N° ${data.order_number}`}</div>
        {data.offline && <div className="text-amber-600 font-bold mb-1">En cola · número al reconectar</div>}
        <div className="text-2xl font-black mb-4">{money(data.total)}</div>
        <div className="grid gap-2">
          <button onClick={() => openPrint(buildKitchenTicketHTML(data, settings))} className="btn-pos bg-zinc-800 text-white">🍗 Ticket de cocina</button>
          <button onClick={() => openPrint(buildCustomerReceiptHTML(data, settings))} className="btn-pos bg-blue-600 text-white">🧾 Imprimir boleta</button>
          <a href={whatsappUrl(data, settings)} target="_blank" rel="noreferrer" className="btn-pos bg-green-600 text-white block">📲 Enviar por WhatsApp</a>
          <button onClick={onClose} className="px-4 py-3 rounded-2xl bg-zinc-200 font-bold mt-1">Nueva venta</button>
        </div>
      </div>
    </div>
  );
}
