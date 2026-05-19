import Groq from "groq-sdk";
import { config } from "../config.js";

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
};

export async function callGroq(
  messages: LLMMessage[],
  tools: object[]
): Promise<LLMResponse> {
  const client = getGroqClient();

  const response = await client.chat.completions.create({
    model: config.groq.model,
    messages: messages as Parameters<typeof client.chat.completions.create>[0]["messages"],
    tools: tools.length > 0
      ? (tools as Parameters<typeof client.chat.completions.create>[0]["tools"])
      : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
    temperature: 0.7,
    max_tokens: 2048,
  });

  const choice = response.choices[0];
  if (!choice) throw new Error("Groq retornou resposta vazia.");

  return {
    content: choice.message.content ?? null,
    tool_calls: (choice.message.tool_calls as GroqToolCall[]) ?? [],
    finish_reason: choice.finish_reason ?? "stop",
  };
}
