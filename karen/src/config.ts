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
} as const;

export type Config = typeof config;
