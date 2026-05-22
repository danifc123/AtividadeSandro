import OpenAI from "openai";
import { config } from "../config.js";
import type { LLMMessage, LLMResponse, GroqToolCall } from "./groq.js";
import { usageFromApi } from "./usage.js";

// ─── OpenRouter Fallback Client ───────────────────────────────────────────────

let openrouterClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openrouterClient) {
    if (!config.openrouter.apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY não configurada. Defina no .env para usar o fallback."
      );
    }
    openrouterClient = new OpenAI({
      apiKey: config.openrouter.apiKey,
      baseURL: config.openrouter.baseUrl,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/karen-agent",
        "X-Title": "Karen Agent",
      },
    });
  }
  return openrouterClient;
}

export async function callOpenRouter(
  messages: LLMMessage[],
  tools: object[]
): Promise<LLMResponse> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: config.openrouter.model,
    messages: messages as Parameters<
      typeof client.chat.completions.create
    >[0]["messages"],
    tools:
      tools.length > 0
        ? (tools as Parameters<
            typeof client.chat.completions.create
          >[0]["tools"])
        : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
    temperature: 0.7,
    max_tokens: 2048,
  });

  const choice = response.choices[0];
  if (!choice) throw new Error("OpenRouter retornou resposta vazia.");

  return {
    content: choice.message.content ?? null,
    tool_calls: (choice.message.tool_calls as GroqToolCall[]) ?? [],
    finish_reason: choice.finish_reason ?? "stop",
    usage: usageFromApi(response.usage),
  };
}
