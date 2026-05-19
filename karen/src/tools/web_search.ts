import type { Tool } from "./tool.js";
import { performWebSearch } from "../search/providers.js";

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Busca informações atualizadas na internet: notícias, clima, cotações (dólar, euro), esportes, etc. " +
    "Para cotação de moedas use uma query clara, ex: 'cotação dólar comercial hoje'.",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Consulta em português (ex: 'cotação dólar hoje', 'clima São Paulo', 'notícias tecnologia')",
      },
    },
    required: ["query"],
  },

  async execute(args, _ctx) {
    const query = String(args.query).trim();
    if (!query) {
      return { error: "O parâmetro 'query' não pode ser vazio." };
    }

    try {
      const { provider, results } = await performWebSearch(query, 3);
      return { query, provider, results };
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      console.error("web_search error:", details);
      return {
        error: "Não foi possível completar a busca neste momento.",
        details,
        hint:
          "Para cotações, tente 'cotação dólar hoje'. Para buscas gerais, configure SERPER_API_KEY no .env (serper.dev — plano gratuito).",
      };
    }
  },
};
