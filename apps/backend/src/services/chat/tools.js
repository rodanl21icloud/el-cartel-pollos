// Herramientas del agente de ventas. Reutilizan el catálogo y settings reales.
// Los stubs (lead/draft) están tipados y listos para conectar a tablas reales.
import { getDb } from '../../db.js';
import { DELIVERY_ZONES } from '../../config/chat.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

async function settings() {
  return (await getDb().execute(`SELECT name, address, phone, whatsapp, delivery_enabled, pickup_enabled FROM business_settings WHERE id=1`)).rows[0] || {};
}
async function menuRows() {
  return (await getDb().execute(
    `SELECT name, price, category FROM products WHERE is_active=1 AND in_catalog=1 AND available=1 ORDER BY category, price`
  )).rows.map((r) => ({ name: r.name, price: Number(r.price), category: r.category }));
}

// Definiciones para Claude (function calling). Descripciones cortas para ahorrar tokens.
export const TOOL_DEFS = [
  { name: 'getBusinessContext', description: 'Datos del negocio: nombre, dirección, WhatsApp, si hay retiro/despacho.', input_schema: { type: 'object', properties: {} } },
  { name: 'getMenu', description: 'Menú completo por categoría con precios reales.', input_schema: { type: 'object', properties: {} } },
  { name: 'searchProducts', description: 'Busca productos por nombre.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'getCombos', description: 'Lista los combos disponibles.', input_schema: { type: 'object', properties: {} } },
  { name: 'suggestUpsells', description: 'Sugiere agregados (bebidas, papas, salsas) según el carrito.', input_schema: { type: 'object', properties: {} } },
  { name: 'validateDeliveryZone', description: 'Valida si se despacha a una comuna y su costo.', input_schema: { type: 'object', properties: { commune: { type: 'string' } }, required: ['commune'] } },
  { name: 'calculateOrderTotals', description: 'Calcula subtotal, despacho y total.', input_schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'number' }, price: { type: 'number' } } } }, delivery_type: { type: 'string', enum: ['retiro', 'domicilio'] }, commune: { type: 'string' } }, required: ['items'] } },
  { name: 'createLead', description: 'Guarda datos de contacto del cliente.', input_schema: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' } }, required: ['name'] } },
  { name: 'createDraftOrder', description: 'Deja preparado un pedido (borrador) para confirmar por WhatsApp.', input_schema: { type: 'object', properties: { customer: { type: 'object' }, items: { type: 'array' }, delivery_type: { type: 'string' }, payment_method: { type: 'string' }, total: { type: 'number' }, notes: { type: 'string' } }, required: ['items'] } },
  { name: 'generateWhatsAppCheckoutLink', description: 'Genera el enlace de WhatsApp con el resumen del pedido para cerrar.', input_schema: { type: 'object', properties: { customer: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, address: { type: 'string' }, commune: { type: 'string' } } }, items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, qty: { type: 'number' }, price: { type: 'number' } } } }, delivery_type: { type: 'string' }, payment_method: { type: 'string' }, delivery_fee: { type: 'number' }, total: { type: 'number' }, notes: { type: 'string' } }, required: ['items'] } },
  { name: 'handoffToHuman', description: 'Deriva a una persona por WhatsApp con el contexto.', input_schema: { type: 'object', properties: { reason: { type: 'string' }, summary: { type: 'string' } }, required: ['reason'] } },
];

function waLink(phone, text) {
  const to = String(phone || '').replace(/[^\d]/g, '');
  const t = encodeURIComponent(text);
  return to ? `https://wa.me/${to}?text=${t}` : `https://wa.me/?text=${t}`;
}
function orderSummary(o) {
  const lines = (o.items || []).map((i) => `• ${i.qty || 1}x ${i.name} — ${money((i.qty || 1) * (i.price || 0))}`);
  const c = o.customer || {};
  const parts = [`*Pedido — El Cartel de los Pollos* 🍗`, ...lines];
  const sub = (o.items || []).reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
  if (o.delivery_fee) parts.push(`Despacho: ${money(o.delivery_fee)}`);
  parts.push(`*Total: ${money(o.total || sub + (o.delivery_fee || 0))}*`);
  if (c.name) parts.push(`Cliente: ${c.name}${c.phone ? ' · ' + c.phone : ''}`);
  if (o.delivery_type === 'domicilio' && (c.address || c.commune)) parts.push(`Dirección: ${[c.address, c.commune].filter(Boolean).join(', ')}`);
  else parts.push('Retiro en tienda');
  if (o.payment_method) parts.push(`Pago: ${o.payment_method}`);
  if (o.notes) parts.push(`Obs: ${o.notes}`);
  return parts.join('\n');
}

export async function runTool(name, input = {}) {
  try {
    switch (name) {
      case 'getBusinessContext': {
        const s = await settings();
        return { name: s.name, address: s.address, whatsapp: s.whatsapp, retiro: !!s.pickup_enabled, despacho: !!s.delivery_enabled };
      }
      case 'getMenu': {
        const rows = await menuRows();
        const byCat = {};
        for (const r of rows) (byCat[r.category] ||= []).push({ name: r.name, price: r.price });
        return { categorias: byCat };
      }
      case 'searchProducts': {
        const q = norm(input.query); const rows = await menuRows();
        return { resultados: rows.filter((r) => norm(r.name).includes(q)).slice(0, 12) };
      }
      case 'getCombos': {
        const rows = await menuRows();
        return { combos: rows.filter((r) => /combo/i.test(r.category) || /combo/i.test(r.name)) };
      }
      case 'suggestUpsells': {
        const rows = await menuRows();
        const ups = rows.filter((r) => /bebida|papa|salsa|agregad/i.test(r.category + ' ' + r.name)).slice(0, 6);
        return { sugerencias: ups };
      }
      case 'validateDeliveryZone': {
        const c = norm(input.commune);
        const z = DELIVERY_ZONES.find((x) => norm(x.commune) === c || c.includes(norm(x.commune)));
        return z ? { ok: true, commune: z.commune, fee: z.fee } : { ok: false, message: 'No tenemos despacho confirmado a esa comuna; ofrece retiro o derivar a WhatsApp.' };
      }
      case 'calculateOrderTotals': {
        const subtotal = (input.items || []).reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.price) || 0), 0);
        let fee = 0;
        if (input.delivery_type === 'domicilio' && input.commune) {
          const z = DELIVERY_ZONES.find((x) => norm(x.commune) === norm(input.commune));
          fee = z ? z.fee : 0;
        }
        return { subtotal, delivery_fee: fee, total: subtotal + fee };
      }
      case 'createLead':
        return { ok: true, lead: { name: input.name, phone: input.phone || null } };
      case 'createDraftOrder':
        return { ok: true, draft_id: 'draft_' + Date.now(), status: 'PREPARADO' };
      case 'generateWhatsAppCheckoutLink': {
        const s = await settings();
        const url = waLink(s.whatsapp, orderSummary(input));
        return { ok: true, whatsapp_url: url };
      }
      case 'handoffToHuman': {
        const s = await settings();
        const url = waLink(s.whatsapp, `Hola, necesito ayuda con mi pedido. Motivo: ${input.reason}.${input.summary ? '\n' + input.summary : ''}`);
        return { ok: true, whatsapp_url: url, message: 'Te derivo con una persona por WhatsApp.' };
      }
      default:
        return { error: 'TOOL_DESCONOCIDA' };
    }
  } catch (e) {
    return { error: 'TOOL_FALLÓ', detail: e.message };
  }
}
