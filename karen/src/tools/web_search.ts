import type { Tool } from "./tool.js";
import { search } from "duck-duck-scrape";

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Realiza uma busca na internet para encontrar informações atualizadas sobre notícias, clima, esportes, cotações ou qualquer fato que você não tenha certeza. Retorna os resultados mais relevantes da web.",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A consulta de busca (ex: 'clima em São Paulo hoje', 'cotação do dólar', 'notícias de tecnologia')",
      },
      limit: {
        type: "number",
        description: "Número máximo de resultados a retornar (padrão: 3, máximo: 5)",
      },
    },
    required: ["query"],
  },

  async execute(args, _ctx) {
    const query = String(args.query);
    const limit = Math.min(Math.max(Number(args.limit) || 3, 1), 5);

    try {
      const results = await search(query);

      if (!results.results || results.results.length === 0) {
        return { error: "Nenhum resultado encontrado para esta busca." };
      }

      // Format results compactly to save tokens
      return {
        query,
        results: results.results.slice(0, limit).map((r) => ({
          title: r.title,
          snippet: r.description,
          url: r.url,
        })),
      };
    } catch (err) {
      console.error("DuckDuckGo search error:", err);
      return {
        error: "Falha ao acessar o buscador. Tente novamente mais tarde.",
        details: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
