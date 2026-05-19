import { config } from "../config.js";
import { callGroq, type LLMMessage, type GroqToolCall } from "../llm/groq.js";
import { callOpenRouter } from "../llm/openrouter.js";
import { saveMessage, getHistory } from "../memory/sqlite.js";
import { llmTools, executeTool } from "../tools/registry.js";
import { buildSystemPrompt } from "./prompt.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentResult {
  reply: string;
  iterations: number;
  usedFallback: boolean;
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
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("rate_limit") ||
          err.message.includes("429") ||
          err.message.includes("quota"));

      if (isRateLimit && config.openrouter.apiKey) {
        console.warn("⚠️  Groq rate limit atingido. Usando OpenRouter como fallback...");
        const response = await callOpenRouter(messages, tools);
        return { response, usedFallback: true };
      }
      throw err;
    }
  } else {
    const response = await callOpenRouter(messages, tools);
    return { response, usedFallback: true };
  }
}

// ─── Agent Loop ───────────────────────────────────────────────────────────────

export async function runAgentLoop(
  chatId: number | string,
  userMessage: string
): Promise<AgentResult> {
  const maxIterations = config.agent.maxIterations;
  let iterations = 0;
  let usedFallback = false;

  // 1. Persist the user message
  saveMessage(chatId, { role: "user", content: userMessage });

  // 2. Build the message array for the LLM
  //    system prompt + last 50 messages from history
  const history = getHistory(chatId, 50);

  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    ...history.map((m) => {
      // The Groq API rejects null values for optional fields — strip them.
      const msg: LLMMessage = { role: m.role, content: m.content };
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.name) msg.name = m.name;
      return msg;
    }),
  ];

  // 3. Agent loop
  while (iterations < maxIterations) {
    iterations++;
    console.log(`\n🔄 Iteração ${iterations}/${maxIterations}`);

    // Call LLM
    const { response, usedFallback: fb } = await callLLM(
      messages,
      llmTools,
      usedFallback
    );
    usedFallback = usedFallback || fb;

    const { content, tool_calls, finish_reason } = response;

    // ── Case 1: No tool calls — final answer ──────────────────────────────
    if (!tool_calls || tool_calls.length === 0) {
      const reply = content ?? "(sem resposta)";

      // Persist assistant reply
      saveMessage(chatId, { role: "assistant", content: reply });

      console.log(`💬 Resposta final após ${iterations} iteração(ões).`);
      return { reply, iterations, usedFallback };
    }

    // ── Case 2: Tool calls requested ─────────────────────────────────────
    // Add the assistant message with tool_calls to the local context
    // (we don't persist tool_calls to SQLite — only text messages)
    messages.push({
      role: "assistant",
      content: content ?? null,
      tool_calls,
    });

    // Execute each tool in sequence and append results
    for (const toolCall of tool_calls as GroqToolCall[]) {
      let toolResult: string;

      try {
        const args = JSON.parse(toolCall.function.arguments || "{}") as Record<
          string,
          unknown
        >;
        toolResult = await executeTool(toolCall.function.name, args);
      } catch (err) {
        toolResult = JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
        });
        console.error(`❌ Erro na tool ${toolCall.function.name}:`, err);
      }

      // Append tool result to local message context
      messages.push({
        role: "tool",
        content: toolResult,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });

      // Persist tool result to memory (as a plain message for retrieval)
      saveMessage(chatId, {
        role: "tool",
        content: toolResult,
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
      });
    }

    // If finish_reason is "stop" even with tool_calls, break safety valve
    if (finish_reason === "stop" && tool_calls.length === 0) break;
  }

  // 4. Max iterations reached — ask LLM for a final answer without tools
  console.warn(`⚠️  Limite de ${maxIterations} iterações atingido. Forçando resposta final.`);

  const { response: finalResponse } = await callLLM(messages, [], usedFallback);
  const reply =
    finalResponse.content ??
    "Desculpe, atingi o limite de processamento para esta mensagem.";

  saveMessage(chatId, { role: "assistant", content: reply });

  return { reply, iterations, usedFallback };
}
