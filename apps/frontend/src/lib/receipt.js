// ============================================================
// Construcción de comprobantes (HTML para impresión térmica) y del
// texto para enviar por WhatsApp. Soporta papel de 58mm y 80mm.
// ============================================================
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const fecha = (iso) => {
  try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return ''; }
};
const metodo = { EFECTIVO: 'Efectivo', POS: 'Tarjeta (POS)', TRANSFERENCIA: 'Transferencia' };

function docShell(width, inner) {
  const w = width === 58 ? 58 : 80;
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  @page { size: ${w}mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  body { width: ${w}mm; margin: 0; font-family: 'Courier New', monospace; color: #000; }
  .r { font-size: ${w === 58 ? 11 : 12}px; line-height: 1.35; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .big { font-size: ${w === 58 ? 16 : 19}px; font-weight: 700; }
  .xl { font-size: ${w === 58 ? 30 : 38}px; font-weight: 800; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .right { text-align: right; }
  .muted { color: #000; }
</style></head><body><div class="r">${inner}</div>
<script>window.onload=function(){window.print();setTimeout(function(){window.close();},300);};</script>
</body></html>`;
}

/** Boleta/comprobante para el cliente. */
export function buildCustomerReceiptHTML(data, settings = {}) {
  const w = settings.paper_width || 80;
  const rows = (data.items || []).map((i) =>
    `<tr><td>${i.qty} x ${esc(i.name)}</td><td class="right">${money(i.line_total)}</td></tr>`
  ).join('');
  const inner = `
    <div class="c big">${esc(settings.name || 'El Cartel de los Pollos')}</div>
    ${settings.address ? `<div class="c">${esc(settings.address)}</div>` : ''}
    ${settings.phone ? `<div class="c">${esc(settings.phone)}</div>` : ''}
    ${settings.rut ? `<div class="c">RUT ${esc(settings.rut)}</div>` : ''}
    <hr>
    <div class="c">Pedido</div>
    <div class="c xl">N° ${data.order_number ?? '—'}</div>
    <div>${fecha(data.sold_at || Date.now())}</div>
    <hr>
    <table>${rows}</table>
    <hr>
    <table>
      <tr><td class="big">TOTAL</td><td class="right big">${money(data.total)}</td></tr>
      <tr><td>Pago</td><td class="right">${metodo[data.payment_method] || data.payment_method || ''}</td></tr>
    </table>
    <hr>
    <div class="c">${esc(settings.footer || '¡Gracias por tu pedido!')}</div>
  `;
  return docShell(w, inner);
}

/** Ticket de cocina: sin precios, ítems grandes, N° prominente. */
export function buildKitchenTicketHTML(data, settings = {}) {
  const w = settings.paper_width || 80;
  const rows = (data.items || []).map((i) =>
    `<div class="big">${i.qty} x ${esc(i.name)}</div>`
  ).join('');
  const inner = `
    <div class="c b">COCINA</div>
    <div class="c xl">N° ${data.order_number ?? '—'}</div>
    <div class="c">${fecha(data.sold_at || Date.now())}</div>
    <hr>
    ${rows}
    <hr>
    <div class="c">Despacho / Delivery</div>
  `;
  return docShell(w, inner);
}

/** Texto para enviar el comprobante por WhatsApp. */
export function buildWhatsappText(data, settings = {}) {
  const lines = [];
  lines.push(`*${settings.name || 'El Cartel de los Pollos'}*`);
  lines.push(`Pedido N° ${data.order_number ?? '—'}`);
  lines.push('');
  (data.items || []).forEach((i) => lines.push(`${i.qty} x ${i.name}  ${money(i.line_total)}`));
  lines.push('');
  lines.push(`*TOTAL: ${money(data.total)}*`);
  lines.push(`Pago: ${metodo[data.payment_method] || data.payment_method || ''}`);
  if (settings.footer) { lines.push(''); lines.push(settings.footer); }
  return lines.join('\n');
}

/** Abre WhatsApp con el comprobante. phone opcional (formato internacional sin +). */
export function whatsappUrl(data, settings = {}, phone) {
  const text = encodeURIComponent(buildWhatsappText(data, settings));
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
