import { Bot, type Context } from "grammy";
import { config } from "../config.js";
import { runAgentLoop } from "../agent/loop.js";
import { clearHistory, countMessages } from "../memory/sqlite.js";

// ─── Bot Setup ────────────────────────────────────────────────────────────────

export function createBot(): Bot {
  const bot = new Bot(config.telegram.botToken);

  // ── Security: Whitelist Middleware ────────────────────────────────────────
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId || !config.telegram.allowedUserIds.includes(userId)) {
      console.warn(`🚫 Acesso negado para user_id: ${userId ?? "desconhecido"}`);
      await ctx.reply("⛔ Acesso não autorizado.").catch(() => {});
      return; // do NOT call next()
    }

    await next();
  });

  // ── /start ────────────────────────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name ?? "você";
    await ctx.reply(
      `Olá, ${name}! 👋 Eu sou a ${config.agent.name}, sua assistente pessoal.\n\n` +
        `Pode me mandar qualquer mensagem. Use /help para ver os comandos disponíveis.`
    );
  });

  // ── /help ─────────────────────────────────────────────────────────────────
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `*Comandos disponíveis:*\n\n` +
        `/start — Apresentação\n` +
        `/help — Esta mensagem\n` +
        `/clear — Limpa o histórico desta conversa\n` +
        `/status — Mostra informações da sessão\n\n` +
        `Basta me enviar uma mensagem de texto para conversar!`,
      { parse_mode: "Markdown" }
    );
  });

  // ── /clear ────────────────────────────────────────────────────────────────
  bot.command("clear", async (ctx) => {
    const chatId = ctx.chat.id;
    clearHistory(chatId);
    await ctx.reply("🗑️ Histórico limpo! Podemos começar uma nova conversa.");
  });

  // ── /status ───────────────────────────────────────────────────────────────
  bot.command("status", async (ctx) => {
    const chatId = ctx.chat.id;
    const msgCount = countMessages(chatId);
    await ctx.reply(
      `*Status da sessão:*\n\n` +
        `🤖 Agente: ${config.agent.name}\n` +
        `🧠 Modelo: \`${config.groq.model}\`\n` +
        `💬 Mensagens no histórico: ${msgCount}\n` +
        `🔄 Max iterações: ${config.agent.maxIterations}\n` +
        `👤 User ID: \`${ctx.from?.id}\``,
      { parse_mode: "Markdown" }
    );
  });

  // ── Text messages → Agent Loop ────────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const userMessage = ctx.message.text;

    // Ignore commands (already handled above)
    if (userMessage.startsWith("/")) return;

    console.log(`\n📨 [${chatId}] ${ctx.from?.first_name}: ${userMessage}`);

    // Show typing indicator
    await ctx.replyWithChatAction("typing");

    try {
      const { reply, iterations, usedFallback } = await runAgentLoop(
        chatId,
        userMessage
      );

      // Append debug info in dev mode
      const isDev = process.env.NODE_ENV !== "production";
      const footer =
        isDev && iterations > 1
          ? `\n\n_[${iterations} iterações${usedFallback ? " • fallback" : ""}]_`
          : "";

      await ctx.reply(reply + footer, {
        parse_mode: "Markdown",
      });
    } catch (err) {
      console.error("❌ Erro no agent loop:", err);
      await ctx.reply(
        "⚠️ Ocorreu um erro ao processar sua mensagem. Por favor, tente novamente."
      );
    }
  });

  // ── Unsupported message types ─────────────────────────────────────────────
  bot.on("message", async (ctx) => {
    await ctx.reply(
      "Por enquanto só consigo processar mensagens de texto. Em breve terei mais capacidades! 🚀"
    );
  });

  // ── Error handler ─────────────────────────────────────────────────────────
  bot.catch((err) => {
    console.error("❌ Erro não tratado no bot:", err);
  });

  return bot;
}
