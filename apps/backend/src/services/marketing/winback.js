// ============================================================
// Agente Comercial Proactivo: redacta mensajes de recuperación (win-back)
// para clientes dormidos (15–60 días sin comprar). NO envía: devuelve
// borradores + wa.me links para que gerencia revise y envíe con un clic.
// El teléfono NUNCA se envía al modelo (solo primer nombre + métricas).
// ============================================================
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../../db.js';

const MODEL = process.env.WINBACK_MODEL || 'claude-haiku-4-5';
const EPHEMERAL = { type: 'ephemeral' };
const firstName = (n) => String(n || 'cliente').trim().split(/\s+/)[0];

// Persona "Los Pollos Hermanos": cordial, profesional, con guiño sutil. Sin amenazas.
const SYSTEM_PROMPT = `Eres el encargado de fidelización de "El Cartel de los Pollos", una pollería chilena de delivery.
Escribes mensajes de WhatsApp para reconquistar clientes que hace tiempo no compran.
Tono: cálido, cercano y profesional, con un guiño sutil al universo "Los Pollos Hermanos" (calidad, "el sabor de siempre", "te extrañamos en la familia") SIN amenazas, sin violencia, sin referencias a drogas.
Reglas:
- Español de Chile, trato de "tú".
- Máximo 2 frases (~280 caracteres). Un solo emoji como máximo.
- Usa el primer nombre y menciona su producto favorito si se entrega.
- Incluye un incentivo suave para volver (ej: "pásate", "te guardamos tu favorito").
- No inventes promociones con % ni precios.
- No incluyas enlaces ni números de teléfono.`;

// Esquema de salida estructurada: un mensaje por cliente.
const OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { client_id: { type: 'string' }, text: { type: 'string' } },
        required: ['client_id', 'text'],
      },
    },
  },
  required: ['messages'],
};

export async function selectDormant(db, { minDays = 15, maxDays = 60, limit = 50 } = {}) {
  const rows = (await db.execute({
    sql: `SELECT c.id, c.name, c.phone,
                 COUNT(s.id) AS n_orders,
                 CAST(julianday('now') - julianday(MAX(s.sold_at)) AS INTEGER) AS days_since,
                 (SELECT p.name FROM sale_items si JOIN sales s2 ON s2.id=si.sale_id
                    JOIN products p ON p.id=si.product_id
                   WHERE s2.client_id=c.id AND s2.status='CONFIRMADA'
                   GROUP BY si.product_id ORDER BY SUM(si.qty) DESC LIMIT 1) AS favorite
          FROM clients c
          JOIN sales s ON s.client_id=c.id AND s.status='CONFIRMADA'
          WHERE c.phone IS NOT NULL AND TRIM(c.phone) <> ''
          GROUP BY c.id
          HAVING days_since BETWEEN ? AND ?
          ORDER BY n_orders DESC, days_since ASC
          LIMIT ?`,
    args: [minDays, maxDays, Math.min(Number(limit) || 50, 100)],
  })).rows;
  return rows.map((r) => ({
    id: r.id, name: r.name, phone: r.phone,
    n_orders: Number(r.n_orders), days_since: Number(r.days_since),
    favorite: r.favorite || null,
  }));
}

const waUrl = (phone, text) =>
  `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

// Fallback sin API key: plantilla simple (la venta/operación nunca depende de la IA).
const fallback = (c) =>
  `Hola ${firstName(c.name)} 👋 ¡Te extrañamos en El Cartel de los Pollos! ` +
  (c.favorite ? `¿Se te antoja un ${c.favorite}? ` : '') + 'Pásate, te esperamos.';

export async function draftWinbacks(opts = {}) {
  const db = getDb();
  const targets = await selectDormant(db, opts);
  if (!targets.length) return { count: 0, drafts: [] };

  const key = process.env.ANTHROPIC_API_KEY;
  let byId = new Map();

  if (key) {
    try {
      const client = new Anthropic({ apiKey: key, timeout: 30000 });
      // Solo primer nombre + métricas al modelo (sin teléfono ni apellidos).
      const roster = targets.map((c) => ({
        client_id: c.id, nombre: firstName(c.name),
        dias_sin_comprar: c.days_since, favorito: c.favorite, pedidos: c.n_orders,
      }));
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: EPHEMERAL }],
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content:
          `Redacta un mensaje de WhatsApp para cada cliente de esta lista (uno por client_id):\n${JSON.stringify(roster)}` }],
      });
      const txt = res.content.find((b) => b.type === 'text')?.text || '{}';
      for (const m of (JSON.parse(txt).messages || [])) byId.set(m.client_id, m.text);
    } catch { byId = new Map(); /* degradado: plantilla */ }
  }

  const drafts = targets.map((c) => {
    const text = byId.get(c.id) || fallback(c);
    return {
      client_id: c.id, name: firstName(c.name), days_since: c.days_since,
      favorite: c.favorite, message: text, whatsapp_url: waUrl(c.phone, text),
      ai: byId.has(c.id),
    };
  });
  return { count: drafts.length, model: key ? MODEL : 'plantilla', drafts };
}
