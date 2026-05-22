/** Uso de tokens retornado pelas APIs (quando disponível). */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export function emptyUsage(): TokenUsage {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

export function usageFromApi(raw?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
} | null): TokenUsage {
  if (!raw) return emptyUsage();
  const prompt = raw.prompt_tokens ?? 0;
  const completion = raw.completion_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: raw.total_tokens ?? prompt + completion,
  };
}
