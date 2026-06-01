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
      else window.open(whatsappUrl(r, settings), '_blank');
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
        <label className="text-xs font-bold text-ink-mute flex flex-col gap-1 col-span-2 sm:col-span-1">N° orden<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: 42" inputMode="numeric" className="field" /></label>
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
              <tr key={v.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="p-3 font-black text-cartel tabular-nums">{v.order_number ?? '—'}</td>
                <td className="whitespace-nowrap text-ink-mute">{fecha(v.sold_at)}</td>
                <td className="max-w-xs"><div className="truncate">{v.kind === 'LIBRE' ? 'Venta libre' : (v.detalle || '—')}</div>{v.client_name && <div className="text-xs text-ink-mute">{v.client_name}</div>}</td>
                <td className="text-right font-bold tabular-nums whitespace-nowrap">{money(v.total)}</td>
                <td className="whitespace-nowrap text-xs">{METODO[v.payment_method] || v.payment_method}</td>
                <td className="text-right whitespace-nowrap">
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
    </div>
  );
}
