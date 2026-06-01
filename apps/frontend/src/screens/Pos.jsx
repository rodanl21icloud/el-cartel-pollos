import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { recordSale, flushQueue } from '../lib/offlineStore.js';
import { buildCustomerReceiptHTML, buildKitchenTicketHTML, whatsappUrl } from '../lib/receipt.js';
import { openPrint } from '../lib/print.js';

const PAYMENTS = [
  { id: 'EFECTIVO', label: '💵 Efectivo', color: 'bg-green-600' },
  { id: 'POS', label: '💳 POS', color: 'bg-blue-600' },
  { id: 'TRANSFERENCIA', label: '📲 Transferencia', color: 'bg-purple-600' },
];

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// Orden preferido de las pestañas de categoría.
const CAT_ORDER = ['POLLO', 'COMBOS', 'COLACIONES', 'PAPAS', 'SNACKS', 'BEBIDAS'];

export default function Pos() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({ name: 'El Cartel de los Pollos', paper_width: 80 });
  const [cart, setCart] = useState({}); // product_id -> qty
  const [cat, setCat] = useState('TODO');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [lastSale, setLastSale] = useState(null); // comprobante recién emitido

  useEffect(() => { api('/products').then(setProducts).catch(() => {}); }, []);
  useEffect(() => { api('/settings').then(setSettings).catch(() => {}); }, []);
  useEffect(() => { flushQueue(); }, []);

  const items = products.filter((p) => cart[p.id]);
  const total = items.reduce((s, p) => s + p.price * cart[p.id], 0);

  // Categorías presentes, en el orden preferido.
  const cats = CAT_ORDER.filter((c) => products.some((p) => p.category === c));
  const otras = [...new Set(products.map((p) => p.category))].filter((c) => !CAT_ORDER.includes(c));
  const tabs = ['TODO', ...cats, ...otras];

  const q = search.trim().toLowerCase();
  const visible = products.filter((p) =>
    (cat === 'TODO' || p.category === cat) &&
    (!q || p.name.toLowerCase().includes(q)));

  function add(p) { setCart((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 })); }
  function sub(p) {
    setCart((c) => {
      const q = (c[p.id] || 0) - 1;
      const next = { ...c };
      if (q <= 0) delete next[p.id]; else next[p.id] = q;
      return next;
    });
  }

  async function checkout(method) {
    if (!items.length) return;
    const receiptItems = items.map((p) => ({ name: p.name, qty: cart[p.id], unit_price: p.price, line_total: p.price * cart[p.id] }));
    const soldAt = new Date().toISOString();
    const payload = {
      client_uuid: crypto.randomUUID(),
      payment_method: method,
      sold_at: soldAt,
      items: items.map((p) => ({ product_id: p.id, qty: cart[p.id] })),
    };
    const res = await recordSale(payload);
    setCart({});
    const data = { order_number: res.order_number ?? null, items: receiptItems, total, payment_method: method, sold_at: soldAt };
    if (res.synced) {
      setLastSale(data); // muestra el panel de comprobante
    } else {
      setLastSale({ ...data, offline: true });
      setToast('📴 Sin red: pedido en cola (N° al reconectar)');
      setTimeout(() => setToast(null), 3500);
    }
  }

  return (
    <div className="grid md:grid-cols-3 gap-4 max-w-6xl mx-auto">
      {/* Catálogo con pestañas por categoría + búsqueda */}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visible.map((p) => (
            <button key={p.id} onClick={() => add(p)}
              className="btn-pos bg-white text-zinc-800 border-2 border-zinc-200 hover:border-cartel text-left !py-4">
              <div className="text-sm font-black leading-tight">{p.name}</div>
              <div className="text-cartel mt-1 font-bold">{money(p.price)}</div>
              {cart[p.id] && <div className="mt-1 text-xs text-zinc-500">x{cart[p.id]} en carrito</div>}
            </button>
          ))}
          {!products.length && <p className="text-zinc-500 col-span-full">Cargando catálogo…</p>}
          {products.length > 0 && !visible.length && <p className="text-zinc-400 col-span-full">Sin resultados.</p>}
        </div>
      </div>

      {/* Carrito + pago */}
      <div className="bg-white rounded-2xl p-4 shadow flex flex-col">
        <h2 className="font-black text-lg mb-2">Pedido</h2>
        <div className="flex-1 space-y-2 overflow-auto">
          {items.map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <span className="font-semibold">{p.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => sub(p)} className="w-9 h-9 rounded-lg bg-zinc-200 text-xl font-black">−</button>
                <span className="w-6 text-center font-bold">{cart[p.id]}</span>
                <button onClick={() => add(p)} className="w-9 h-9 rounded-lg bg-zinc-200 text-xl font-black">+</button>
              </div>
            </div>
          ))}
          {!items.length && <p className="text-zinc-400">Toca productos para agregar.</p>}
        </div>

        <div className="border-t mt-3 pt-3">
          <div className="flex justify-between text-2xl font-black mb-3">
            <span>Total</span><span>{money(total)}</span>
          </div>
          <div className="grid gap-2">
            {PAYMENTS.map((m) => (
              <button key={m.id} disabled={!items.length} onClick={() => checkout(m.id)}
                className={`btn-pos text-white disabled:opacity-40 ${m.color}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">
          {toast}
        </div>
      )}

      {lastSale && (
        <ReceiptPanel data={lastSale} settings={settings} onClose={() => setLastSale(null)} />
      )}
    </div>
  );
}

// Panel post-venta: número de orden + acciones de comprobante.
function ReceiptPanel({ data, settings, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-30" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm text-zinc-500">Pedido registrado</div>
        <div className="text-6xl font-black text-cartel my-1">
          {data.offline ? '⏳' : `N° ${data.order_number}`}
        </div>
        {data.offline && <div className="text-amber-600 font-bold mb-1">En cola · número al reconectar</div>}
        <div className="text-2xl font-black mb-4">{money(data.total)}</div>

        <div className="grid gap-2">
          <button onClick={() => openPrint(buildKitchenTicketHTML(data, settings))}
            className="btn-pos bg-zinc-800 text-white">🍗 Ticket de cocina</button>
          <button onClick={() => openPrint(buildCustomerReceiptHTML(data, settings))}
            className="btn-pos bg-blue-600 text-white">🧾 Imprimir boleta</button>
          <a href={whatsappUrl(data, settings)} target="_blank" rel="noreferrer"
            className="btn-pos bg-green-600 text-white block">📲 Enviar por WhatsApp</a>
          <button onClick={onClose} className="px-4 py-3 rounded-2xl bg-zinc-200 font-bold mt-1">Nuevo pedido</button>
        </div>
      </div>
    </div>
  );
}
