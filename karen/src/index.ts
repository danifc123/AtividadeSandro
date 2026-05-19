import "dotenv/config";
import { config } from "./config.js";
import { createBot } from "./bot/telegram.js";
import { getDb } from "./memory/sqlite.js";

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════╗
║        🤖  Karen Agent  🤖           ║
║  Assistente Pessoal via Telegram     ║
╚══════════════════════════════════════╝
  `);

  // 1. Initialise DB (runs migrations)
  getDb();

  // 2. Log config summary (never log secrets)
  console.log(`⚙️  Configuração:`);
  console.log(`   Modelo Groq    : ${config.groq.model}`);
  console.log(`   Modelo Fallback: ${config.openrouter.model || "(não configurado)"}`);
  console.log(`   DB Path        : ${config.db.path}`);
  console.log(`   Max Iterações  : ${config.agent.maxIterations}`);
  console.log(
    `   Usuários OK    : [${config.telegram.allowedUserIds.join(", ")}]`
  );
  console.log(``);

  // 3. Create and start the bot (long polling)
  const bot = createBot();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Recebido ${signal}. Encerrando Karen...`);
    await bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start long polling
  console.log(`🚀 Karen está online! Aguardando mensagens...\n`);
  await bot.start({
    onStart: (info) => {
      console.log(`✅ Bot conectado: @${info.username}`);
    },
  });
}

main().catch((err) => {
  console.error("💥 Erro fatal ao inicializar Karen:", err);
  process.exit(1);
});
