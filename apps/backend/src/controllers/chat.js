// Endpoint público del chatbot de ventas. Valida input, rate-limit por IP,
// y nunca devuelve 500 al widget (responde con fallback amable).
import { chatTurn } from '../services/chat/agent.js';

const HITS = new Map(); // ip -> [timestamps]
const WINDOW = 60_000, MAX_PER_WINDOW = 20;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW);
  arr.push(now); HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear(); // poda simple
  return arr.length > MAX_PER_WINDOW;
}

/** POST /api/public/chat  Body: { messages: [{role:'user'|'assistant', content:string}] } */
export async function chat(req, res) {
  const ip = req.ip || 'anon';
  if (rateLimited(ip)) return res.status(429).json({ reply: 'Vas muy rápido 😅 dame un segundo y reintenta.', wa: null });

  const messages = req.body?.messages;
  if (!Array.isArray(messages) || !messages.length || messages.length > 40)
    return res.status(400).json({ error: 'MENSAJES_INVALIDOS' });
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 2000)
      return res.status(400).json({ error: 'MENSAJE_INVALIDO' });
  }
  if (messages[messages.length - 1].role !== 'user')
    return res.status(400).json({ error: 'ULTIMO_DEBE_SER_USER' });

  try {
    const out = await chatTurn(messages);
    return res.json(out);
  } catch (e) {
    console.error('[chat] error:', e.message);
    return res.json({ reply: 'Tuvimos un problema técnico 🙈 Sigue tu pedido por WhatsApp y te atendemos al toque.', wa: null, error: true });
  }
}
