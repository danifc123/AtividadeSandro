import {
  getHistory,
  saveMessage,
  setKV,
  getKV,
  clearHistory,
  summaryKey,
} from "../memory/sqlite.js";
import type { StoredMessage } from "../memory/sqlite.js";
import { config } from "../config.js";
import { callGroq } from "../llm/groq.js";
import { callOpenRouter } from "../llm/openrouter.js";
import { recordLLMUsage } from "../guardrails/cost.js";

// ─── Token Estimation ─────────────────────────────────────────────────────────
// Portuguese text ≈ 3.5 chars/token. +8 overhead per message for role tokens.

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function estimateMsgTokens(msg: StoredMessage): number {
  return estimateTokens(msg.content) + 8;
}

const MAX_HISTORY_TOKENS = 3000;   // Limit before compression kicks in
const TARGET_KEEP_TOKENS = 1500;   // Recent tokens to keep after compression
// ─── Context Window ───────────────────────────────────────────────────────────

export interface ContextWindow {
  summary: string | null;
  messages: StoredMessage[];
  estimatedTokens: number;
}

/**
 * Pilar B — Janela de Contexto Deslizante com Sumarização.
 * Mantém o histórico dentro do limite de tokens.
 * Se exceder, sumariza as mensagens antigas e mantém apenas as recentes.
 */
export async function buildContextWindow(
  chatId: string | number,
  useFallback = false
): Promise<ContextWindow> {
  const id = String(chatId);
  const allMessages = getHistory(id, 100);
  const existingSummary = getKV<string>(summaryKey(chatId));

  const historyTokens = allMessages.reduce((s, m) => s + estimateMsgTokens(m), 0);
  const summaryTokens = existingSummary ? estimateTokens(existingSummary) : 0;
  const totalTokens = historyTokens + summaryTokens;

  console.log(`📊 Contexto: ${allMessages.length} msgs | ~${totalTokens} tokens estimados`);

  if (totalTokens <= MAX_HISTORY_TOKENS) {
    return { summary: existingSummary, messages: allMessages, estimatedTokens: totalTokens };
  }

  // ── Compression needed ────────────────────────────────────────────────────
  console.log(`⚙️  Janela excedida (~${totalTokens} tokens). Comprimindo memória...`);

  // Walk newest → oldest, collect messages that fit in TARGET_KEEP_TOKENS
  let recentTokens = 0;
  let splitIndex = 0;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    const t = estimateMsgTokens(allMessages[i]);
    if (recentTokens + t > TARGET_KEEP_TOKENS) {
      splitIndex = i + 1;
      break;
    }
    recentTokens += t;
  }

  const toSummarize = allMessages.slice(0, splitIndex);
  const toKeep = allMessages.slice(splitIndex);

  if (toSummarize.length === 0) {
    return { summary: existingSummary, messages: toKeep, estimatedTokens: recentTokens + summaryTokens };
  }

  console.log(`📝 Sumarizando ${toSummarize.length} mensagens antigas...`);
  const newSummary = await summarizeMessages(
    toSummarize,
    existingSummary,
    useFallback,
    id
  );

  // Persist compressed state to DB
  setKV(summaryKey(chatId), newSummary);
  clearHistory(id);
  for (const msg of toKeep) {
    saveMessage(id, {
      role: msg.role,
      content: msg.content,
      ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
      ...(msg.name ? { name: msg.name } : {}),
      ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
    });
  }

  const newTotal = recentTokens + estimateTokens(newSummary);
  console.log(`✅ Comprimido! ${toKeep.length} msgs recentes + resumo (~${newTotal} tokens)`);

  return { summary: newSummary, messages: toKeep, estimatedTokens: newTotal };
}

// ─── Summarization ────────────────────────────────────────────────────────────

async function summarizeMessages(
  messages: StoredMessage[],
  existingSummary: string | null,
  useFallback: boolean,
  chatId: string
): Promise<string> {
  const transcript = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Usuário" : "Karen"}: ${m.content}`)
    .join("\n");

  const userContent = existingSummary
    ? `Resumo anterior:\n${existingSummary}\n\nNovas mensagens a integrar:\n${transcript}`
    : `Conversa a resumir:\n${transcript}`;

  try {
    const result = useFallback
      ? await callOpenRouter(
          [
            {
              role: "system",
              content:
                "Resuma a conversa abaixo em português de forma concisa. " +
                "Preserve fatos, preferências e contexto importantes. Máximo 200 palavras.",
            },
            { role: "user", content: userContent },
          ],
          []
        )
      : await callGroq(
          [
            {
              role: "system",
              content:
                "Resuma a conversa abaixo em português de forma concisa. " +
                "Preserve fatos, preferências e contexto importantes. Máximo 200 palavras.",
            },
            { role: "user", content: userContent },
          ],
          []
        );

    recordLLMUsage({
      chatId,
      provider: useFallback ? "openrouter" : "groq",
      model: useFallback ? config.openrouter.model : config.groq.model,
      usage: result.usage,
      label: "summarize",
    });

    return result.content ?? fallbackSummary(messages, existingSummary);
  } catch (err) {
    console.error("⚠️  Erro ao sumarizar histórico:", err);
    return fallbackSummary(messages, existingSummary);
  }
}

function fallbackSummary(messages: StoredMessage[], existing: string | null): string {
  return existing
    ? `${existing} [+ ${messages.length} mensagens anteriores]`
    : `[${messages.length} mensagens anteriores não puderam ser resumidas]`;
}

export function getSummary(chatId: string | number): string | null {
  return getKV<string>(summaryKey(chatId));
}
