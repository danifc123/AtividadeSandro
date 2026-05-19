import type { GroqToolCall } from "./groq.js";

/** Extrai corpo JSON de erros Groq (ex.: "400 {...}"). */
export function parseGroqErrorBody(err: unknown): {
  code?: string;
  failed_generation?: string;
} | null {
  const msg = err instanceof Error ? err.message : String(err);
  const start = msg.indexOf("{");
  if (start === -1) return null;
  try {
    const body = JSON.parse(msg.slice(start)) as { error?: { code?: string; failed_generation?: string } };
    return body.error ?? null;
  } catch {
    return null;
  }
}

/**
 * Groq/Llama às vezes gera `<function=nome{...json...}</function>` em vez de tool_calls nativos.
 * Recupera a chamada para o agent loop executar normalmente.
 */
export function salvageToolCallsFromFailedGeneration(text: string): GroqToolCall[] {
  const match = text.match(/<function=(\w+)(\{[\s\S]*?\})<\/function>/i);
  if (!match) return [];

  const name = match[1];
  let argsObj: Record<string, unknown>;
  try {
    argsObj = JSON.parse(match[2]) as Record<string, unknown>;
  } catch {
    return [];
  }

  // Coerce números enviados como string (ex.: "limit": "1")
  for (const [key, val] of Object.entries(argsObj)) {
    if (typeof val === "string" && /^\d+$/.test(val)) {
      argsObj[key] = Number(val);
    }
  }

  return [
    {
      id: `call_salvaged_${Date.now()}`,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(argsObj),
      },
    },
  ];
}
