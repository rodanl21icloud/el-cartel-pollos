import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { recordSale } from '../../lib/offlineStore.js';
import { CAT_ORDER } from './posShared.js';
import ProductSearch from './ProductSearch.jsx';
import ProductGrid from './ProductGrid.jsx';
import Cart from './Cart.jsx';
import ModifierModal from './ModifierModal.jsx';
import PaymentPanel from './PaymentPanel.jsx';

// Venta de productos: catálogo + carrito con modificadores + confirmación de pago.
let _uid = 0;
export default function ProductSale({ onSold, preload }) {
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([]); // [{ uid, productId, name, basePrice, qty, modifiers:[{id,name,price_delta}], modsTotal }]
  const [cat, setCat] = useState('TODO');
  const [search, setSearch] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [modalProduct, setModalProduct] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { api('/products').then(setProducts).catch(() => {}); }, []);
  // Precarga al carro un producto sugerido (al entrar desde "Los más vendidos").
  useEffect(() => { if (preload) tapProduct(preload); /* eslint-disable-next-line */ }, []);

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

  async function createSale(method, { discount = 0, client = null, deliveryFee = 0, notifyPhone = null, supervisorAuth = null } = {}) {
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
    if (notifyPhone) payload.notify_phone = notifyPhone;
    // Validación de supervisor para descuentos sobre el tope (Fase 1.2).
    if (supervisorAuth) payload.supervisor_auth = supervisorAuth;
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
    return <PaymentPanel lines={confLines} subtotal={total} onBack={() => setConfirming(false)} onCreate={createSale} />;
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <ProductSearch search={search} onSearch={setSearch} cat={cat} onCat={setCat} tabs={tabs} />
        <ProductGrid products={products} visible={visible} qtyInCart={qtyInCart} onTap={tapProduct} />
      </div>

      <Cart lines={lines} total={total} totalUnidades={totalUnidades}
        onInc={incLine} onDec={decLine} onNote={setLineNote} onCheckout={() => setConfirming(true)} />

      {modalProduct && (
        <ModifierModal product={modalProduct}
          onCancel={() => setModalProduct(null)}
          onConfirm={(opts) => { addLine(modalProduct, opts); setModalProduct(null); }} />
      )}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>}
    </div>
  );
}
