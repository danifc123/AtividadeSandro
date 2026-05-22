import "dotenv/config";

function require_env(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`❌ Variável de ambiente obrigatória ausente: ${key}`);
  }
  return value;
}

function optional_env(key: string, fallback: string = ""): string {
  return process.env[key] ?? fallback;
}

export const config = {
  telegram: {
    botToken: require_env("TELEGRAM_BOT_TOKEN"),
    allowedUserIds: require_env("TELEGRAM_ALLOWED_USER_IDS")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map(Number),
  },

  groq: {
    apiKey: require_env("GROQ_API_KEY"),
    model: optional_env("GROQ_MODEL", "llama-3.3-70b-versatile"),
  },

  openrouter: {
    apiKey: optional_env("OPENROUTER_API_KEY"),
    model: optional_env(
      "OPENROUTER_MODEL",
      "meta-llama/llama-3.3-70b-instruct:free"
    ),
    baseUrl: "https://openrouter.ai/api/v1",
  },

  db: {
    path: optional_env("DB_PATH", "./memory.db"),
  },

  agent: {
    maxIterations: parseInt(optional_env("AGENT_MAX_ITERATIONS", "10"), 10),
    name: "Karen",
  },

  /** Opcional — melhora buscas gerais (Serper/Tavily). Câmbio usa AwesomeAPI sem chave. */
  search: {
    serperApiKey: optional_env("SERPER_API_KEY"),
    tavilyApiKey: optional_env("TAVILY_API_KEY"),
  },

  /** Guardrails — custo (USD) e segurança de conteúdo externo */
  guardrails: {
    cost: {
      /** USD por 1M tokens de entrada (Groq Llama 3.3 70B — ajuste conforme tarifa atual) */
      groq: {
        inputUsdPerM: parseFloat(optional_env("GROQ_INPUT_USD_PER_M", "0.59")),
        outputUsdPerM: parseFloat(optional_env("GROQ_OUTPUT_USD_PER_M", "0.79")),
      },
      openrouter: {
        inputUsdPerM: parseFloat(optional_env("OPENROUTER_INPUT_USD_PER_M", "0")),
        outputUsdPerM: parseFloat(optional_env("OPENROUTER_OUTPUT_USD_PER_M", "0")),
      },
      /** 0 = sem limite; se > 0, bloqueia novas mensagens ao atingir o valor */
      monthlyBudgetUsd: parseFloat(optional_env("MONTHLY_BUDGET_USD", "0")),
    },
    security: {
      enabled: optional_env("GUARDRAIL_SECURITY_ENABLED", "true") !== "false",
    },
  },
} as const;

export type Config = typeof config;
