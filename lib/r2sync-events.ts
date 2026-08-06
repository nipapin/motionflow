import "server-only";

import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db";

const TABLE = "r2sync_events";
let tableEnsured = false;

export type R2SyncEvent = {
  id: number;
  author_id: number;
  object_key: string;
  action: string;
  meta_json: Record<string, unknown> | null;
  created_at: string;
};

async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       author_id BIGINT UNSIGNED NOT NULL,
       object_key VARCHAR(512) NOT NULL,
       action VARCHAR(64) NOT NULL,
       meta_json JSON NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       KEY idx_author_created (author_id, created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  tableEnsured = true;
}

export async function recordR2SyncEvent(opts: {
  authorId: number;
  key: string;
  action: string;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureTable();
  const pool = getPool();
  await pool.query<ResultSetHeader>(
    `INSERT INTO \`${TABLE}\` (author_id, object_key, action, meta_json) VALUES (?, ?, ?, ?)`,
    [
      opts.authorId,
      opts.key.slice(0, 512),
      opts.action.slice(0, 64),
      opts.meta ? JSON.stringify(opts.meta) : null,
    ],
  );
}

export async function listR2SyncEvents(opts: {
  authorId?: number;
  limit?: number;
}): Promise<R2SyncEvent[]> {
  await ensureTable();
  const pool = getPool();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const [rows] = opts.authorId
    ? await pool.query<RowDataPacket[]>(
        `SELECT id, author_id, object_key, action, meta_json, created_at
         FROM \`${TABLE}\`
         WHERE author_id = ?
         ORDER BY id DESC
         LIMIT ?`,
        [opts.authorId, limit],
      )
    : await pool.query<RowDataPacket[]>(
        `SELECT id, author_id, object_key, action, meta_json, created_at
         FROM \`${TABLE}\`
         ORDER BY id DESC
         LIMIT ?`,
        [limit],
      );

  return rows.map((r) => ({
    id: Number(r.id),
    author_id: Number(r.author_id),
    object_key: String(r.object_key),
    action: String(r.action),
    meta_json:
      r.meta_json == null
        ? null
        : typeof r.meta_json === "string"
          ? (JSON.parse(r.meta_json) as Record<string, unknown>)
          : (r.meta_json as Record<string, unknown>),
    created_at:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}
