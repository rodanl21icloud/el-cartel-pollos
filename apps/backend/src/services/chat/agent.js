// Orquestador del agente: llama a Claude con tools y resuelve el loop de function calling.
// Sin API key -> modo degradado (deriva a WhatsApp). Nunca lanza al cliente.
//
// Optimización de tokens (prompt caching):
//   1) `system` con cache_control -> cachea el prefijo estático [tools + system].
//   2) Breakpoint en el ÚLTIMO mensaje en cada paso del tool-loop -> cachea el
//      prefijo de conversación que crece, evitando reprocesar tokens ya vistos
//      (gran ahorro en function-calling de varios pasos y entre turnos < 5 min).
//   3) Ventana deslizante de historial -> acota los tokens de entrada en chats largos.
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, FALLBACK_REPLY } from '../../config/chat.js';
import { TOOL_DEFS, runTool } from './tools.js';

const MODEL = process.env.CHAT_MODEL || 'claude-3-5-haiku-latest';
const MAX_STEPS = 5;
const MAX_HISTORY = 20;          // últimos N mensajes que se envían al modelo
const EPHEMERAL = { type: 'ephemeral' };

// Marca el último bloque del último mensaje con cache_control: el prefijo de
// conversación queda cacheado para el siguiente paso/turno (no se reprocesa).
function withConversationCache(messages) {
  if (!messages.length) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  let content = last.content;
  if (typeof content === 'string') {
    content = [{ type: 'text', text: content, cache_control: EPHEMERAL }];
  } else if (Array.isArray(content) && content.length) {
    content = content.map((b, i) =>
      i === content.length - 1 ? { ...b, cache_control: EPHEMERAL } : b);
  } else {
    return out; // contenido vacío: nada que cachear
  }
  out[out.length - 1] = { ...last, content };
  return out;
}

export async function chatTurn(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { reply: FALLBACK_REPLY, wa: null, degraded: true };

  const client = new Anthropic({ apiKey: key, timeout: 25000 });
  // Prefijo estático cacheado: tools (primero) + system (breakpoint aquí).
  const system = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: EPHEMERAL }];
  const recent = messages.length > MAX_HISTORY ? messages.slice(-MAX_HISTORY) : messages;
  const convo = recent.map((m) => ({ role: m.role, content: String(m.content) }));
  let wa = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOL_DEFS,
      messages: withConversationCache(convo),
    });

    if (res.stop_reason === 'tool_use') {
      const results = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        const out = await runTool(block.name, block.input || {});
        if (out && out.whatsapp_url) wa = out.whatsapp_url;
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
      }
      convo.push({ role: 'assistant', content: res.content });
      convo.push({ role: 'user', content: results });
      continue;
    }

    const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { reply: reply || FALLBACK_REPLY, wa, degraded: false };
  }
  return { reply: 'Mejor cerremos por WhatsApp 👇', wa, degraded: false };
}
