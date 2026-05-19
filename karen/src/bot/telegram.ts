import { Bot } from "grammy";
import { config } from "../config.js";
import { runAgentLoop } from "../agent/loop.js";
import {
  clearChatMemory,
  countMessages,
  getHistory,
  getKV,
  summaryKey,
} from "../memory/sqlite.js";
import { estimateTokens } from "../agent/memory.js";
import {
  downloadFromTelegram,
  parseUploadedBuffer,
  saveUploadedFile,
  getUploadedFile,
  MAX_UPLOAD_BYTES,
} from "../files/uploads.js";

// ─── Bot Setup ────────────────────────────────────────────────────────────────

export function createBot(): Bot {
  const bot = new Bot(config.telegram.botToken);

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!userId || !config.telegram.allowedUserIds.includes(userId)) {
      console.warn(`🚫 Acesso negado para user_id: ${userId ?? "desconhecido"}`);
      await ctx.reply("⛔ Acesso não autorizado.").catch(() => {});
      return;
    }

    await next();
  });

  bot.command("start", async (ctx) => {
    const name = ctx.from?.first_name ?? "você";
    await ctx.reply(
      `Olá, ${name}! 👋 Eu sou a ${config.agent.name}, sua assistente pessoal.\n\n` +
        `Pode me mandar qualquer mensagem. Use /help para ver os comandos disponíveis.`
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      `*Comandos disponíveis:*\n\n` +
        `/start — Apresentação\n` +
        `/help — Esta mensagem\n` +
        `/clear — Limpa histórico, resumo e arquivo em cache\n` +
        `/status — Informações da sessão\n\n` +
        `*Integrações:*\n` +
        `• Envie uma *mensagem de texto* para conversar\n` +
        `• Envie um *documento* (.csv, .txt ou .pdf, até 2 MB) e depois pergunte sobre o arquivo\n` +
        `• Perguntas sobre notícias/clima/cotações usam busca na web automaticamente`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("clear", async (ctx) => {
    clearChatMemory(ctx.chat.id);
    await ctx.reply(
      "🗑️ Memória limpa (histórico, resumo e arquivo em cache). Podemos começar de novo."
    );
  });

  bot.command("status", async (ctx) => {
    const chatId = ctx.chat.id;
    const msgCount = countMessages(chatId);
    const history = getHistory(chatId, 100);
    const histTokens = history.reduce(
      (s, m) => s + estimateTokens(m.content) + 8,
      0
    );
    const summary = getKV<string>(summaryKey(chatId));
    const summaryTokens = summary ? estimateTokens(summary) : 0;
    const uploaded = getUploadedFile(chatId);

    await ctx.reply(
      `*Status da sessão:*\n\n` +
        `🤖 Agente: ${config.agent.name}\n` +
        `🧠 Modelo: \`${config.groq.model}\`\n` +
        `💬 Msgs no histórico: ${msgCount}\n` +
        `📊 Tokens estimados: ~${histTokens + summaryTokens}\n` +
        `📝 Resumo: ${summary ? "✅ ativo" : "❌ nenhum"}\n` +
        `📎 Arquivo: ${uploaded ? `\`${uploaded.filename}\` (${uploaded.type})` : "nenhum"}\n` +
        `🔄 Max iterações: ${config.agent.maxIterations}\n` +
        `👤 User ID: \`${ctx.from?.id}\``,
      { parse_mode: "Markdown" }
    );
  });

  // ── Integração: upload de arquivos (CSV / TXT / PDF) ─────────────────────
  bot.on("message:document", async (ctx) => {
    const chatId = ctx.chat.id;
    const doc = ctx.message.document;

    if (doc.file_size && doc.file_size > MAX_UPLOAD_BYTES) {
      await ctx.reply(`⚠️ Arquivo muito grande. O limite é ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return;
    }

    await ctx.replyWithChatAction("upload_document");

    try {
      const file = await ctx.api.getFile(doc.file_id);
      if (!file.file_path) {
        throw new Error("Telegram não retornou caminho do arquivo.");
      }

      const buffer = await downloadFromTelegram(file.file_path);
      const filename = doc.file_name ?? "arquivo.dat";
      const meta = await parseUploadedBuffer(buffer, filename);

      saveUploadedFile(chatId, meta);

      const extra =
        meta.type === "csv"
          ? `\n📊 ${meta.rowCount} linhas | colunas: ${meta.columns?.join(", ") ?? "—"}`
          : meta.type === "pdf"
            ? `\n📄 ${meta.pageCount} página(s)`
            : `\n📝 ${meta.charCount} caracteres`;

      await ctx.reply(
        `✅ Arquivo *${meta.filename}* recebido e processado.${extra}\n\n` +
          `Agora pode fazer perguntas sobre o conteúdo (ex.: "resuma o CSV", "qual a média da coluna X").`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ Erro ao processar documento:", msg);
      await ctx.reply(`⚠️ Não consegui processar o arquivo: ${msg}`);
    }
  });

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const userMessage = ctx.message.text;

    if (userMessage.startsWith("/")) return;

    console.log(`\n📨 [${chatId}] ${ctx.from?.first_name}: ${userMessage}`);

    await ctx.replyWithChatAction("typing");

    try {
      const { reply, iterations, usedFallback, estimatedTokens } =
        await runAgentLoop(chatId, userMessage);

      const isDev = process.env.NODE_ENV !== "production";
      const footer = isDev
        ? `\n\n_[${iterations} iter${usedFallback ? " • fallback" : ""} • ~${estimatedTokens} tokens]_`
        : "";

      await ctx
        .reply(reply + footer, { parse_mode: "Markdown" })
        .catch(() => ctx.reply(reply + footer));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("❌ Erro no agent loop:", msg);
      await ctx.reply(
        msg.includes("Limite") || msg.includes("Falha ao contactar")
          ? `⚠️ ${msg}`
          : "⚠️ Ocorreu um erro ao processar sua mensagem. Por favor, tente novamente."
      );
    }
  });

  // Outros tipos de mensagem (não texto, não documento)
  bot.on("message", async (ctx) => {
    if ("text" in ctx.message || "document" in ctx.message) return;

    await ctx.reply(
      "Por enquanto processo *texto* e *documentos* (.csv, .txt, .pdf). " +
        "Outros formatos em breve! 🚀",
      { parse_mode: "Markdown" }
    );
  });

  bot.catch((err) => {
    console.error("❌ Erro não tratado no bot:", err);
  });

  return bot;
}
