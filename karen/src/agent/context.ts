import type { LLMMessage } from "../llm/groq.js";
import type { StoredMessage } from "../memory/sqlite.js";

/** Converte mensagem persistida para o formato da API Groq/OpenRouter. */
export function storedToLLM(m: StoredMessage): LLMMessage {
  const msg: LLMMessage = {
    role: m.role,
    content: m.content || null,
  };
  if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
  if (m.name) msg.name = m.name;
  if (m.tool_calls?.length) msg.tool_calls = m.tool_calls;
  return msg;
}
