import type { Tool } from "./tool.js";
import { getUploadedFile } from "../files/uploads.js";

const MAX_EXCERPT_CHARS = 12_000;

export const analyzeUploadedFileTool: Tool = {
  name: "analyze_uploaded_file",
  description:
    "Lê o conteúdo do último arquivo (.csv, .txt ou .pdf) que o usuário enviou no Telegram. " +
    "Use quando o usuário fizer perguntas sobre dados, planilhas ou documentos enviados. " +
    "Opcionalmente filtre por palavra-chave ou limite de linhas (CSV).",
  schema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description:
          "O que o usuário quer saber sobre o arquivo (ajuda a focar o trecho retornado).",
      },
      max_lines: {
        type: "number",
        description: "Para CSV: máximo de linhas de dados a incluir (padrão 50).",
      },
      keyword: {
        type: "string",
        description: "Filtrar linhas que contenham esta palavra (útil em CSV grandes).",
      },
    },
    required: [],
  },

  async execute(args, ctx) {
    const file = getUploadedFile(ctx.chatId);

    if (!file) {
      return {
        error: "Nenhum arquivo em memória.",
        hint: "Peça ao usuário para enviar um documento .csv, .txt ou .pdf no Telegram antes de analisar.",
      };
    }

    const maxLines = Math.min(Math.max(Number(args.max_lines) || 50, 1), 200);
    const keyword = args.keyword ? String(args.keyword).toLowerCase() : null;
    const question = args.question ? String(args.question) : null;

    let excerpt = file.content;

    if (file.type === "csv") {
      const lines = file.content.split(/\r?\n/);
      const header = lines[0] ?? "";
      let dataLines = lines.slice(1);

      if (keyword) {
        dataLines = dataLines.filter((l) => l.toLowerCase().includes(keyword));
      }

      excerpt = [header, ...dataLines.slice(0, maxLines)].join("\n");
    }

    if (excerpt.length > MAX_EXCERPT_CHARS) {
      excerpt = excerpt.slice(0, MAX_EXCERPT_CHARS) + "\n… [conteúdo truncado]";
    }

    return {
      filename: file.filename,
      type: file.type,
      ...(file.rowCount !== undefined ? { rowCount: file.rowCount } : {}),
      ...(file.columns ? { columns: file.columns } : {}),
      ...(file.pageCount !== undefined ? { pageCount: file.pageCount } : {}),
      charCount: file.charCount ?? file.content.length,
      question: question ?? null,
      excerpt,
    };
  },
};
