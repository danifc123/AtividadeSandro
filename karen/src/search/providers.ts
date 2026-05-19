import { search as ddgSearch } from "duck-duck-scrape";
import { config } from "../config.js";
import type { WebSearchHit, WebSearchResult } from "./types.js";

const DDG_MIN_INTERVAL_MS = 4_000;
let lastDdgRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Detecção de consultas financeiras (câmbio) ─────────────────────────────

const CURRENCY_PATTERNS: { pattern: RegExp; pair: string; label: string }[] = [
  { pattern: /d[oó]lar|usd/i, pair: "USD-BRL", label: "Dólar (USD) → Real" },
  { pattern: /euro|eur\b/i, pair: "EUR-BRL", label: "Euro (EUR) → Real" },
  { pattern: /libra|gbp/i, pair: "GBP-BRL", label: "Libra (GBP) → Real" },
  { pattern: /bitcoin|btc/i, pair: "BTC-BRL", label: "Bitcoin (BTC) → Real" },
];

function detectCurrencyPair(query: string): { pair: string; label: string } | null {
  const q = query.toLowerCase();
  const isFinance =
    /cota[cç][aã]o|cambio|câmbio|valor|pre[cç]o|hoje|comercial|turismo/.test(q) ||
    CURRENCY_PATTERNS.some((c) => c.pattern.test(q));

  if (!isFinance) return null;

  for (const c of CURRENCY_PATTERNS) {
    if (c.pattern.test(q)) return { pair: c.pair, label: c.label };
  }

  if (/cota[cç][aã]o|cambio|d[oó]lar|usd/i.test(q)) {
    return { pair: "USD-BRL", label: "Dólar (USD) → Real" };
  }

  return null;
}

async function searchAwesomeApi(
  query: string,
  pair: string,
  label: string
): Promise<WebSearchResult> {
  const url = `https://economia.awesomeapi.com.br/json/last/${pair}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "KarenAgent/1.0" },
  });

  if (!res.ok) {
    throw new Error(`AwesomeAPI retornou HTTP ${res.status}`);
  }

  const data = (await res.json()) as Record<
    string,
    {
      name: string;
      bid: string;
      ask: string;
      pctChange: string;
      create_date: string;
      high: string;
      low: string;
    }
  >;

  const entry = Object.values(data)[0];
  if (!entry) throw new Error("Resposta de câmbio vazia.");

  const hit: WebSearchHit = {
    title: `Cotação ${label} — ${entry.name}`,
    snippet: [
      `Compra (bid): R$ ${entry.bid}`,
      `Venda (ask): R$ ${entry.ask}`,
      `Variação: ${entry.pctChange}%`,
      `Máx/Mín do dia: R$ ${entry.high} / R$ ${entry.low}`,
      `Atualizado: ${entry.create_date}`,
    ].join(" | "),
    url: "https://economia.awesomeapi.com.br",
  };

  return { query, provider: "awesomeapi", results: [hit] };
}

// ─── Serper (Google) — opcional, recomendado para buscas gerais ───────────────

async function searchSerper(query: string, limit: number): Promise<WebSearchResult> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": config.search.serperApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: query,
      num: limit,
      gl: "br",
      hl: "pt-br",
    }),
  });

  if (!res.ok) {
    throw new Error(`Serper HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    organic?: Array<{ title: string; snippet: string; link: string }>;
  };

  const results: WebSearchHit[] = (data.organic ?? []).slice(0, limit).map((r) => ({
    title: r.title,
    snippet: r.snippet,
    url: r.link,
  }));

  if (results.length === 0) throw new Error("Serper não retornou resultados.");
  return { query, provider: "serper", results };
}

// ─── Tavily — opcional ───────────────────────────────────────────────────────

async function searchTavily(query: string, limit: number): Promise<WebSearchResult> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: config.search.tavilyApiKey,
      query,
      max_results: limit,
      search_depth: "basic",
    }),
  });

  if (!res.ok) {
    throw new Error(`Tavily HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    results?: Array<{ title: string; content: string; url: string }>;
  };

  const results: WebSearchHit[] = (data.results ?? []).slice(0, limit).map((r) => ({
    title: r.title,
    snippet: r.content,
    url: r.url,
  }));

  if (results.length === 0) throw new Error("Tavily não retornou resultados.");
  return { query, provider: "tavily", results };
}

// ─── DuckDuckGo (scrape) — gratuito, pode bloquear IP ─────────────────────────

async function searchDuckDuckGo(query: string, limit: number): Promise<WebSearchResult> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const elapsed = Date.now() - lastDdgRequestAt;
    if (elapsed < DDG_MIN_INTERVAL_MS) {
      await sleep(DDG_MIN_INTERVAL_MS - elapsed);
    }
    lastDdgRequestAt = Date.now();

    try {
      const data = await ddgSearch(query, {
        locale: "pt-br",
        region: "br-pt",
        marketRegion: "BR",
        safeSearch: 0,
      });

      if (!data.results?.length) {
        throw new Error("Nenhum resultado no DuckDuckGo.");
      }

      const results = data.results.slice(0, limit).map((r) => ({
        title: r.title,
        snippet: r.description,
        url: r.url,
      }));

      return { query, provider: "duckduckgo", results };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isAnomaly = lastError.message.includes("anomaly");
      console.warn(
        `⚠️  DuckDuckGo tentativa ${attempt}/${maxAttempts} falhou:`,
        lastError.message
      );
      if (attempt < maxAttempts) {
        await sleep(isAnomaly ? 5_000 * attempt : 2_000 * attempt);
      }
    }
  }

  throw lastError ?? new Error("DuckDuckGo indisponível.");
}

// ─── Orquestrador ─────────────────────────────────────────────────────────────

/**
 * Busca na web com fallbacks. Não altera outras tools do agente.
 * Ordem: câmbio (AwesomeAPI) → Serper → Tavily → DuckDuckGo
 */
export async function performWebSearch(
  query: string,
  limit = 3
): Promise<WebSearchResult> {
  const currency = detectCurrencyPair(query);
  if (currency) {
    try {
      return await searchAwesomeApi(query, currency.pair, currency.label);
    } catch (err) {
      console.warn("⚠️  AwesomeAPI falhou, tentando outros provedores:", err);
    }
  }

  const providers: Array<{ name: string; run: () => Promise<WebSearchResult> }> = [];

  if (config.search.serperApiKey) {
    providers.push({ name: "serper", run: () => searchSerper(query, limit) });
  }
  if (config.search.tavilyApiKey) {
    providers.push({ name: "tavily", run: () => searchTavily(query, limit) });
  }
  providers.push({ name: "duckduckgo", run: () => searchDuckDuckGo(query, limit) });

  const errors: string[] = [];

  for (const p of providers) {
    try {
      const result = await p.run();
      console.log(`✅ web_search via ${result.provider} (${result.results.length} resultados)`);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${p.name}: ${msg}`);
      console.warn(`⚠️  Provedor ${p.name} falhou:`, msg);
    }
  }

  throw new Error(
    "Nenhum provedor de busca disponível. " +
      errors.join(" | ") +
      (config.search.serperApiKey || config.search.tavilyApiKey
        ? ""
        : " Dica: configure SERPER_API_KEY (grátis em serper.dev) para buscas estáveis.")
  );
}
