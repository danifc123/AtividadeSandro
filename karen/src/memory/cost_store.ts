import { getDb } from "./sqlite.js";

export interface CostEventInput {
  chatId: string;
  provider: string;
  model: string;
  label: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface CostTotals {
  globalUsd: number;
  globalRequests: number;
  globalPromptTokens: number;
  globalCompletionTokens: number;
  sessionUsd: number;
  sessionRequests: number;
  byProvider: { provider: string; usd: number; requests: number }[];
}

function migrateCostTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS cost_events (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id           TEXT    NOT NULL,
      provider          TEXT    NOT NULL,
      model             TEXT    NOT NULL,
      label             TEXT    NOT NULL DEFAULT 'agent',
      prompt_tokens     INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd          REAL    NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_cost_events_chat ON cost_events(chat_id);
  `);
}

export function insertCostEvent(event: CostEventInput): void {
  migrateCostTable();
  getDb()
    .prepare(
      `INSERT INTO cost_events
       (chat_id, provider, model, label, prompt_tokens, completion_tokens, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.chatId,
      event.provider,
      event.model,
      event.label,
      event.promptTokens,
      event.completionTokens,
      event.costUsd
    );
}

export function getCostTotals(chatId?: string | number): CostTotals {
  migrateCostTable();

  const global = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(cost_usd), 0) as usd,
         COUNT(*) as requests,
         COALESCE(SUM(prompt_tokens), 0) as prompt_t,
         COALESCE(SUM(completion_tokens), 0) as completion_t
       FROM cost_events`
    )
    .get() as {
    usd: number;
    requests: number;
    prompt_t: number;
    completion_t: number;
  };

  let sessionUsd = 0;
  let sessionRequests = 0;

  if (chatId !== undefined) {
    const session = getDb()
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) as usd, COUNT(*) as requests
         FROM cost_events WHERE chat_id = ?`
      )
      .get(String(chatId)) as { usd: number; requests: number };
    sessionUsd = session.usd;
    sessionRequests = session.requests;
  }

  const byProvider = getDb()
    .prepare(
      `SELECT provider, COALESCE(SUM(cost_usd), 0) as usd, COUNT(*) as requests
       FROM cost_events GROUP BY provider ORDER BY usd DESC`
    )
    .all() as { provider: string; usd: number; requests: number }[];

  return {
    globalUsd: global.usd,
    globalRequests: global.requests,
    globalPromptTokens: global.prompt_t,
    globalCompletionTokens: global.completion_t,
    sessionUsd,
    sessionRequests,
    byProvider,
  };
}
