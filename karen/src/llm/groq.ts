import Groq from "groq-sdk";
import { config } from "../config.js";
import {
  parseGroqErrorBody,
  salvageToolCallsFromFailedGeneration,
} from "./tool_salvage.js";
import { usageFromApi, type TokenUsage } from "./usage.js";

// ─── Groq LLM Client ──────────────────────────────────────────────────────────

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: config.groq.apiKey });
  }
  return groqClient;
}

export type LLMMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type GroqToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type LLMResponse = {
  content: string | null;
  tool_calls: GroqToolCall[];
  finish_reason: string;
  usage: TokenUsage;
};

export async function callGroq(
  messages: LLMMessage[],
  tools: object[]
): Promise<LLMResponse> {
  const client = getGroqClient();
  const hasTools = tools.length > 0;

  try {
    const response = await client.chat.completions.create({
      model: config.groq.model,
      messages: messages as Parameters<
        typeof client.chat.completions.create
      >[0]["messages"],
      tools: hasTools
        ? (tools as Parameters<typeof client.chat.completions.create>[0]["tools"])
        : undefined,
      tool_choice: hasTools ? "auto" : undefined,
      parallel_tool_calls: hasTools ? false : undefined,
      temperature: hasTools ? 0.2 : 0.7,
      max_tokens: 2048,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("Groq retornou resposta vazia.");

    return {
      content: choice.message.content ?? null,
      tool_calls: (choice.message.tool_calls as GroqToolCall[]) ?? [],
      finish_reason: choice.finish_reason ?? "stop",
      usage: usageFromApi(response.usage),
    };
  } catch (err) {
    const groqErr = parseGroqErrorBody(err);
    if (
      groqErr?.code === "tool_use_failed" &&
      groqErr.failed_generation &&
      hasTools
    ) {
      const tool_calls = salvageToolCallsFromFailedGeneration(
        groqErr.failed_generation
      );
      if (tool_calls.length > 0) {
        console.warn(
          "⚠️  Groq rejeitou formato de tool — recuperando chamada:",
          tool_calls[0].function.name
        );
        return {
          content: null,
          tool_calls,
          finish_reason: "tool_calls",
          usage: usageFromApi(),
        };
      }
    }
    throw err;
  }
}
