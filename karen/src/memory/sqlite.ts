import Database from "better-sqlite3";
import { config } from "../config.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface StoredMessage {
  role: MessageRole;
  content: string;
  tool_call_id?: string;
  name?: string;
  created_at: number;
}

// ─── Initialise DB ────────────────────────────────────────────────────────────

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.db.path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
    console.log(`💾 SQLite conectado em: ${config.db.path}`);
  }
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id     TEXT    NOT NULL,
      role        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      tool_call_id TEXT,
      name        TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);

    CREATE TABLE IF NOT EXISTS kv_store (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

// ─── Message History ──────────────────────────────────────────────────────────

const stmts = {
  insert: () =>
    getDb().prepare(`
      INSERT INTO messages (chat_id, role, content, tool_call_id, name)
      VALUES (@chat_id, @role, @content, @tool_call_id, @name)
    `),

  select: () =>
    getDb().prepare(`
      SELECT role, content, tool_call_id, name, created_at
      FROM messages
      WHERE chat_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `),

  delete: () =>
    getDb().prepare(`DELETE FROM messages WHERE chat_id = ?`),

  count: () =>
    getDb().prepare(`SELECT COUNT(*) as n FROM messages WHERE chat_id = ?`),
};

export function saveMessage(
  chatId: string | number,
  message: Omit<StoredMessage, "created_at">
): void {
  stmts.insert().run({
    chat_id: String(chatId),
    role: message.role,
    content: message.content,
    tool_call_id: message.tool_call_id ?? null,
    name: message.name ?? null,
  });
}

export function getHistory(
  chatId: string | number,
  limit = 50
): StoredMessage[] {
  return stmts.select().all(String(chatId), limit) as StoredMessage[];
}

export function clearHistory(chatId: string | number): void {
  stmts.delete().run(String(chatId));
}

export function countMessages(chatId: string | number): number {
  const row = stmts.count().get(String(chatId)) as { n: number };
  return row.n;
}

// ─── Key-Value Store ──────────────────────────────────────────────────────────

export function setKV(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO kv_store (key, value, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()`
    )
    .run(key, JSON.stringify(value));
}

export function getKV<T = unknown>(key: string): T | null {
  const row = getDb()
    .prepare(`SELECT value FROM kv_store WHERE key = ?`)
    .get(key) as { value: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.value) as T;
}

export function deleteKV(key: string): void {
  getDb().prepare(`DELETE FROM kv_store WHERE key = ?`).run(key);
}
