// Orquestador del agente: llama a Claude con tools y resuelve el loop de function calling.
// Sin API key -> modo degradado (deriva a WhatsApp). Nunca lanza al cliente.
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, FALLBACK_REPLY } from '../../config/chat.js';
import { TOOL_DEFS, runTool } from './tools.js';

const MODEL = process.env.CHAT_MODEL || 'claude-3-5-haiku-latest';
const MAX_STEPS = 5;

export async function chatTurn(messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { reply: FALLBACK_REPLY, wa: null, degraded: true };

  const client = new Anthropic({ apiKey: key, timeout: 25000 });
  const system = [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }];
  const convo = messages.map((m) => ({ role: m.role, content: String(m.content) }));
  let wa = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1024, system, tools: TOOL_DEFS, messages: convo });

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
