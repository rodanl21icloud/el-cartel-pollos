import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { buildCustomerReceiptHTML, buildKitchenTicketHTML, whatsappUrl } from '../lib/receipt.js';
import { openPrint } from '../lib/print.js';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const METODO = { EFECTIVO: '💵 Efectivo', POS: '💳 Tarjeta', TRANSFERENCIA: '📲 Transf.' };
const fecha = (iso) => { try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };

// Transacciones de venta con filtros y reimpresión de boleta.
export default function Ventas({ canVoid }) {
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState({ name: 'El Cartel de los Pollos', paper_width: 80 });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null); // venta seleccionada -> drawer detalle

  async function load() {
    setBusy(true); setError('');
    const p = new URLSearchParams();
    if (from) p.set('from', from + 'T00:00:00.000Z');
    if (to) p.set('to', to + 'T23:59:59.999Z');
    if (method) p.set('method', method);
    if (q.trim()) p.set('q', q.trim());
    try { setItems(await api(`/sales?${p}`)); } catch (e) { setError(e.message); }
    setBusy(false);
  }
  useEffect(() => { api('/settings').then(setSettings).catch(() => {}); load(); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [from, to, method, q]);

  async function reimprimir(saleId, kind) {
    try {
      const r = await api(`/sales/${saleId}/receipt`);
      if (kind === 'cocina') openPrint(buildKitchenTicketHTML(r, settings));
      else if (kind === 'boleta') openPrint(buildCustomerReceiptHTML(r, settings));
      else {
        let phone = (r.client_phone || '').replace(/\D/g, '');
        if (!phone) { const inp = window.prompt('Número de WhatsApp del cliente (con código país, ej: 56912345678):', '56'); if (inp === null) return; phone = inp.replace(/\D/g, ''); }
        if (phone.length < 9) { setError('Número de WhatsApp inválido (revisa el código de país y los 9 dígitos).'); return; }
        window.open(whatsappUrl(r, settings, phone), '_blank');
      }
    } catch (e) { setError(e.message); }
  }

  async function anular(v) {
    const reason = window.prompt(`Anular venta N° ${v.order_number} (${money(v.total)}). Motivo:`);
    if (reason === null) return;
    try { await api(`/sales/${v.id}/void`, { method: 'POST', body: { reason } }); load(); }
    catch (e) { setError(e.message === 'PERMISO_DENEGADO' ? 'Sin permiso para anular' : e.message); }
  }

  const totalVisible = items.reduce((s, v) => s + v.total, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-xl">Ventas</h2>
        <div className="text-sm text-ink-mute">{items.length} transacciones · <b>{money(totalVisible)}</b></div>
      </div>
      {error && <p className="text-cartel font-semibold">{error}</p>}

      {/* Filtros */}
      <div className="card p-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
        <label className="text-xs font-bold text-ink-mute flex flex-col gap-1">Desde<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field" /></label>
        <label className="text-xs font-bold text-ink-mute flex flex-col gap-1">Hasta<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field" /></label>
        <label className="text-xs font-bold text-ink-mute flex flex-col gap-1">Método
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="field">
            <option value="">Todos</option><option value="EFECTIVO">Efectivo</option><option value="POS">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option>
          </select>
        </label>
        <label className="text-xs font-bold text-ink-mute flex flex-col gap-1 col-span-2 sm:col-span-1">Buscar<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Orden, cliente o teléfono" className="field" /></label>
        <button onClick={() => { setFrom(''); setTo(''); setMethod(''); setQ(''); }} className="self-end px-3 py-2.5 rounded-xl bg-slate-200 font-bold text-sm">Limpiar</button>
      </div>

      {/* Lista */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-ink-mute border-b">
              <th className="p-3">N°</th><th>Fecha</th><th>Detalle</th><th className="text-right">Total</th><th>Pago</th><th className="text-right">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} onClick={() => setSel(v)} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer">
                <td className="p-3 font-black text-cartel tabular-nums">{v.order_number ?? '—'}</td>
                <td className="whitespace-nowrap text-ink-mute">{fecha(v.sold_at)}</td>
                <td className="max-w-xs">
                  <div className="truncate flex items-center gap-1.5">
                    {v.kind === 'LIBRE' ? 'Venta libre' : (v.detalle || '—')}
                    {v.is_backdated && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full whitespace-nowrap" title={v.backdate_reason || 'Venta registrada con fecha pasada'}>🕓 Retroactiva</span>}
                  </div>
                  {v.client_name && <div className="text-xs text-ink-mute">{v.client_name}</div>}
                  {v.is_backdated && v.created_at && <div className="text-[10px] text-ink-mute">ingresada {fecha(v.created_at.includes('T') ? v.created_at : v.created_at.replace(' ', 'T') + 'Z')}</div>}
                </td>
                <td className="text-right font-bold tabular-nums whitespace-nowrap">{money(v.total)}</td>
                <td className="whitespace-nowrap text-xs">{METODO[v.payment_method] || v.payment_method}</td>
                <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => reimprimir(v.id, 'boleta')} title="Imprimir boleta" className="w-8 h-8 rounded-lg hover:bg-slate-200 text-lg">🧾</button>
                  <button onClick={() => reimprimir(v.id, 'cocina')} title="Ticket cocina" className="w-8 h-8 rounded-lg hover:bg-slate-200 text-lg">🍗</button>
                  <button onClick={() => reimprimir(v.id, 'whatsapp')} title="WhatsApp" className="w-8 h-8 rounded-lg hover:bg-slate-200 text-lg">📲</button>
                  {canVoid && <button onClick={() => anular(v)} title="Anular venta" className="w-8 h-8 rounded-lg hover:bg-red-100 text-lg">🚫</button>}
                </td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="6" className="p-4 text-center text-ink-mute">{busy ? 'Cargando…' : 'Sin transacciones en el filtro.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-mute px-2">Muestra hasta 500 ventas. Filtra por fecha para acotar.</p>

      {sel && <SaleDrawer v={sel} canVoid={canVoid} onClose={() => setSel(null)}
        onReprint={(k) => reimprimir(sel.id, k)}
        onVoid={() => { anular(sel); setSel(null); }} />}
    </div>
  );
}

function SaleDrawer({ v, canVoid, onClose, onReprint, onVoid }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/sales/${v.id}/receipt`).then(setD).catch((e) => setErr(e.message)); }, [v.id]);
  const Act = ({ ico, label, onClick, danger }) => (
    <button onClick={onClick} className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-xs font-bold ${danger ? 'text-cartel hover:bg-red-50' : 'text-ink hover:bg-slate-100'}`}>
      <span className="text-xl">{ico}</span>{label}
    </button>
  );
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-[400px] max-w-[92vw] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="font-black text-lg">Detalle de la venta</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-ink text-white grid place-items-center">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {err ? <p className="text-cartel">{err}</p> : !d ? <p className="text-ink-mute">Cargando…</p> : (<>
            <div className="text-center">
              <div className="text-xs text-ink-mute">Pedido N°</div>
              <div className="text-3xl font-black text-cartel">{d.order_number ?? '—'}</div>
              {v.is_backdated && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">🕓 Retroactiva</span>}
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1.5">
              <Row l="Fecha y hora" v={fecha(d.sold_at)} />
              <Row l="Método de pago" v={METODO[d.payment_method] || d.payment_method} />
              {d.client_name && <Row l="Cliente" v={`${d.client_name}${d.client_phone ? ' · ' + d.client_phone : ''}`} />}
              {d.delivery_address && <Row l="Dirección" v={d.delivery_address} />}
              {d.cashier && <Row l="Cajero" v={d.cashier} />}
            </div>
            <div className="border rounded-xl divide-y">
              {(d.items || []).map((it, i) => (
                <div key={i} className="flex justify-between gap-2 p-2.5 text-sm">
                  <div><div className="font-semibold">{it.qty} × {it.name}</div>
                    {(it.modifiers || []).map((m, j) => <div key={j} className="text-xs text-ink-mute">+ {m.name}</div>)}
                    {it.note && <div className="text-xs text-ink-mute">📝 {it.note}</div>}
                  </div>
                  <div className="font-bold tabular-nums whitespace-nowrap">{money(it.line_total)}</div>
                </div>
              ))}
              <div className="flex justify-between p-2.5 font-black"><span>Total</span><span className="tabular-nums">{money(d.total)}</span></div>
            </div>
          </>)}
        </div>
        <div className="flex gap-1 p-3 border-t">
          <Act ico="🧾" label="Boleta" onClick={() => onReprint('boleta')} />
          <Act ico="🍗" label="Cocina" onClick={() => onReprint('cocina')} />
          <Act ico="📲" label="WhatsApp" onClick={() => onReprint('whatsapp')} />
          {canVoid && <Act ico="🚫" label="Anular" onClick={onVoid} danger />}
        </div>
      </aside>
    </div>
  );
}
const Row = ({ l, v }) => <div className="flex justify-between gap-3"><span className="text-ink-mute">{l}</span><span className="font-semibold text-right">{v}</span></div>;
