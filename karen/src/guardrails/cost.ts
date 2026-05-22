import { config } from "../config.js";
import { insertCostEvent, getCostTotals, type CostTotals } from "../memory/cost_store.js";
import type { TokenUsage } from "../llm/usage.js";

export type LLMProvider = "groq" | "openrouter";

export interface CostRecordResult {
  costUsd: number;
  sessionTotalUsd: number;
  globalTotalUsd: number;
  usage: TokenUsage;
}

/** Calcula custo em USD a partir dos tokens e do provedor/modelo. */
export function calculateCostUsd(
  provider: LLMProvider,
  model: string,
  usage: TokenUsage
): number {
  const rates =
    provider === "groq"
      ? config.guardrails.cost.groq
      : config.guardrails.cost.openrouter;

  const inputPerM = rates.inputUsdPerM;
  const outputPerM = rates.outputUsdPerM;

  const inputCost = (usage.prompt_tokens / 1_000_000) * inputPerM;
  const outputCost = (usage.completion_tokens / 1_000_000) * outputPerM;

  return inputCost + outputCost;
}

export function recordLLMUsage(params: {
  chatId: string | number;
  provider: LLMProvider;
  model: string;
  usage: TokenUsage;
  label?: string;
}): CostRecordResult {
  const costUsd = calculateCostUsd(params.provider, params.model, params.usage);

  insertCostEvent({
    chatId: String(params.chatId),
    provider: params.provider,
    model: params.model,
    label: params.label ?? "agent",
    promptTokens: params.usage.prompt_tokens,
    completionTokens: params.usage.completion_tokens,
    costUsd,
  });

  const totals = getCostTotals(params.chatId);

  console.log(
    `💵 Custo API [${params.label ?? "agent"}]: $${costUsd.toFixed(6)} USD ` +
      `(${params.usage.prompt_tokens} in + ${params.usage.completion_tokens} out) ` +
      `| Sessão: $${totals.sessionUsd.toFixed(4)} | Total: $${totals.globalUsd.toFixed(4)}`
  );

  if (
    config.guardrails.cost.monthlyBudgetUsd > 0 &&
    totals.globalUsd >= config.guardrails.cost.monthlyBudgetUsd
  ) {
    console.warn(
      `⚠️  Orçamento mensal configurado atingido: $${totals.globalUsd.toFixed(4)} / $${config.guardrails.cost.monthlyBudgetUsd}`
    );
  }

  return {
    costUsd,
    sessionTotalUsd: totals.sessionUsd,
    globalTotalUsd: totals.globalUsd,
    usage: params.usage,
  };
}

export function formatCostReport(totals: CostTotals, chatId?: string | number): string {
  const lines = [
    `💰 *Controle de custos (USD)*`,
    ``,
    `📊 *Total geral:* $${totals.globalUsd.toFixed(4)}`,
    `🔢 Requisições LLM: ${totals.globalRequests}`,
    `📥 Tokens entrada: ${totals.globalPromptTokens.toLocaleString("en-US")}`,
    `📤 Tokens saída: ${totals.globalCompletionTokens.toLocaleString("en-US")}`,
  ];

  if (chatId !== undefined) {
    lines.push(
      ``,
      `💬 *Esta conversa:* $${totals.sessionUsd.toFixed(4)} (${totals.sessionRequests} req.)`
    );
  }

  if (totals.byProvider.length > 0) {
    lines.push(``, `*Por provedor:*`);
    for (const row of totals.byProvider) {
      lines.push(`• ${row.provider}: $${row.usd.toFixed(4)} (${row.requests}x)`);
    }
  }

  if (config.guardrails.cost.monthlyBudgetUsd > 0) {
    const pct = Math.min(
      100,
      (totals.globalUsd / config.guardrails.cost.monthlyBudgetUsd) * 100
    );
    lines.push(
      ``,
      `🎯 Orçamento configurado: $${config.guardrails.cost.monthlyBudgetUsd.toFixed(2)} (${pct.toFixed(1)}% usado)`
    );
  }

  lines.push(
    ``,
    `_Valores estimados com base nas tarifas em config.ts / .env._`
  );

  return lines.join("\n");
}

export function isOverBudget(): boolean {
  const budget = config.guardrails.cost.monthlyBudgetUsd;
  if (budget <= 0) return false;
  return getCostTotals().globalUsd >= budget;
}
