import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { recordSale, flushQueue } from '../lib/offlineStore.js';

const PAYMENTS = [
  { id: 'EFECTIVO', label: '💵 Efectivo', color: 'bg-green-600' },
  { id: 'POS', label: '💳 POS', color: 'bg-blue-600' },
  { id: 'TRANSFERENCIA', label: '📲 Transferencia', color: 'bg-purple-600' },
];

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

export default function Pos() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({}); // product_id -> qty
  const [toast, setToast] = useState(null);

  useEffect(() => { api('/products').then(setProducts).catch(() => {}); }, []);
  useEffect(() => { flushQueue(); }, []);

  const items = products.filter((p) => cart[p.id]);
  const total = items.reduce((s, p) => s + p.price * cart[p.id], 0);

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
    const payload = {
      client_uuid: crypto.randomUUID(),
      payment_method: method,
      sold_at: new Date().toISOString(),
      items: items.map((p) => ({ product_id: p.id, qty: cart[p.id] })),
    };
    const res = await recordSale(payload);
    setCart({});
    setToast(res.synced ? `Venta registrada (${money(total)})` : 'Sin red: venta en cola offline ✓');
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="grid md:grid-cols-3 gap-4 max-w-6xl mx-auto">
      {/* Catálogo: botones grandes */}
      <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {products.map((p) => (
          <button key={p.id} onClick={() => add(p)}
            className="btn-pos bg-white text-zinc-800 border-2 border-zinc-200 hover:border-cartel text-left">
            <div className="text-base font-black leading-tight">{p.name}</div>
            <div className="text-cartel mt-2">{money(p.price)}</div>
            {cart[p.id] && <div className="mt-1 text-sm text-zinc-500">x{cart[p.id]} en carrito</div>}
          </button>
        ))}
        {!products.length && <p className="text-zinc-500 col-span-full">Cargando catálogo…</p>}
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
    </div>
  );
}
