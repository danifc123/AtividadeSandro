import { config } from "../config.js";
import { callGroq, type LLMMessage, type GroqToolCall } from "../llm/groq.js";
import { callOpenRouter } from "../llm/openrouter.js";
import { saveMessage } from "../memory/sqlite.js";
import { llmTools, executeTool } from "../tools/registry.js";
import {
  buildSystemPrompt,
  parseThought,
  logThought,
  logAction,
  logObservation,
  logFinalReply,
} from "./prompt.js";
import { buildContextWindow } from "./memory.js";
import { storedToLLM } from "./context.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentResult {
  reply: string;
  iterations: number;
  usedFallback: boolean;
  estimatedTokens: number;
}

// ─── LLM call with auto-fallback ──────────────────────────────────────────────

async function callLLM(
  messages: LLMMessage[],
  tools: object[],
  useFallback: boolean
): Promise<{ response: Awaited<ReturnType<typeof callGroq>>; usedFallback: boolean }> {
  if (!useFallback) {
    try {
      const response = await callGroq(messages, tools);
      return { response, usedFallback: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit =
        msg.includes("rate_limit") || msg.includes("429") || msg.includes("quota");
      const isToolUseFailed = msg.includes("tool_use_failed");

      if ((isRateLimit || isToolUseFailed) && config.openrouter.apiKey) {
        console.warn(
          `⚠️  Groq ${isToolUseFailed ? "tool_use_failed" : "rate limit"} — tentando OpenRouter...`
        );
        const response = await callOpenRouter(messages, tools);
        return { response, usedFallback: true };
      }

      console.error("❌ Erro na API LLM:", msg);
      throw new Error(
        isRateLimit
          ? "Limite de requisições da API atingido. Tente novamente em alguns minutos."
          : `Falha ao contactar o modelo: ${msg}`
      );
    }
  }

  const response = await callOpenRouter(messages, tools);
  return { response, usedFallback: true };
}

// ─── Agent Loop ───────────────────────────────────────────────────────────────

export async function runAgentLoop(
  chatId: number | string,
  userMessage: string
): Promise<AgentResult> {
  const maxIterations = config.agent.maxIterations;
  let iterations = 0;
  let usedFallback = false;

  saveMessage(chatId, { role: "user", content: userMessage });

  const contextWindow = await buildContextWindow(chatId, usedFallback);

  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemPrompt(contextWindow.summary) },
    ...contextWindow.messages.map(storedToLLM),
  ];

  while (iterations < maxIterations) {
    iterations++;
    console.log(`\n🔄 Iteração ${iterations}/${maxIterations}`);

    const { response, usedFallback: fb } = await callLLM(messages, llmTools, usedFallback);
    usedFallback = usedFallback || fb;

    const { content, tool_calls, finish_reason } = response;

    const { thought, reply: cleanContent } = parseThought(content);
    if (thought) {
      logThought(thought, iterations);
    }

    if (!tool_calls || tool_calls.length === 0) {
      const reply = cleanContent || content || "(sem resposta)";

      saveMessage(chatId, { role: "assistant", content: reply });
      logFinalReply(reply, iterations);

      return { reply, iterations, usedFallback, estimatedTokens: contextWindow.estimatedTokens };
    }

    // ── Pilar C: tool call(s) ─────────────────────────────────────────────
    logAction(
      (tool_calls as GroqToolCall[]).map((tc) => ({
        name: tc.function.name,
        args: tc.function.arguments || "{}",
      })),
      iterations
    );

    messages.push({
      role: "assistant",
      content: content ?? null,
      tool_calls,
    });

    saveMessage(chatId, {
      role: "assistant",
      content: content ?? "",
      tool_calls: tool_calls as GroqToolCall[],
    });

    for (const toolCall of tool_calls as GroqToolCall[]) {
      let toolResult: string;

      try {
        const args = JSON.parse(toolCall.function.arguments || "{}") as Record<
          string,
          unknown
        >;
        toolResult = await executeTool(toolCall.function.name, args, { chatId });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Erro na tool "${toolCall.function.name}": ${errorMsg}`);
        toolResult = JSON.stringify({
          error: errorMsg,
          tool: toolCall.function.name,
          hint: "A ferramenta falhou. Informe o usuário de forma amigável.",
        });
      }

      logObservation(toolCall.function.name, toolResult, iterations);

      const toolMessage: LLMMessage = {
        role: "tool",
        content: toolResult,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      };
      messages.push(toolMessage);

      saveMessage(chatId, {
        role: "tool",
        content: toolResult,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });
    }

    if (finish_reason === "stop" && tool_calls.length === 0) break;
  }

  console.warn(`⚠️  Limite de ${maxIterations} iterações atingido. Forçando resposta final.`);

  const { response: finalResponse } = await callLLM(messages, [], usedFallback);
  const { reply: finalClean } = parseThought(finalResponse.content);
  const reply =
    finalClean ||
    finalResponse.content ||
    "Desculpe, atingi o limite de processamento para esta mensagem.";

  saveMessage(chatId, { role: "assistant", content: reply });
  logFinalReply(reply, iterations);

  return { reply, iterations, usedFallback, estimatedTokens: contextWindow.estimatedTokens };
}
