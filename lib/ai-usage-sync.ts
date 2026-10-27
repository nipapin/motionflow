import "server-only";
import { randomUUID } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { AiUsageFilters } from "@/lib/ai-usage-shared";
import { ensureAiUsageSchema, rangeKey, saveAiPrediction } from "@/lib/ai-usage-store";

export class AiUsageSyncError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
/** Never follow provider pagination to another host or forward extra query parameters. */
export function replicateNextCursor(next: unknown): string | null {
  if (next == null) return null;
  if (typeof next !== "string") throw new AiUsageSyncError("Replicate returned invalid pagination.", 502);
  const url = new URL(next);
  const cursor = url.searchParams.get("cursor");
  if (url.protocol !== "https:" || url.host !== "api.replicate.com" || url.username || url.password ||
      url.pathname !== "/v1/predictions" || !cursor || cursor.length > 4096) {
    throw new AiUsageSyncError("Replicate returned invalid pagination.", 502);
  }
  return cursor;
}

/** Three pages per request, with a durable cursor and lease shared across server processes. */
export async function syncAiUsage(filters: AiUsageFilters, restart: boolean, signal?: AbortSignal) {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new AiUsageSyncError("Configure REPLICATE_API_TOKEN on the server to sync Replicate history.", 503);
  await ensureAiUsageSchema();
  const pool = getPool(), key = rangeKey(filters.from, filters.to), owner = randomUUID();
  await pool.execute("INSERT IGNORE INTO ai_usage_sync_ranges (range_key) VALUES (?)", [key]);
  const [lease] = await pool.execute<ResultSetHeader>(`UPDATE ai_usage_sync_ranges
    SET lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 120 SECOND), lease_owner = ?
    WHERE range_key = ? AND (lease_until IS NULL OR lease_until < UTC_TIMESTAMP(3))`, [owner, key]);
  if (!lease.affectedRows) throw new AiUsageSyncError("This date range is already syncing. Try again shortly.", 409);
  let imported = 0;
  try {
    const [state] = await pool.execute<RowDataPacket[]>("SELECT next_cursor, complete FROM ai_usage_sync_ranges WHERE range_key = ?", [key]);
    if (!restart && state[0].complete) return { imported, complete: true };
    let cursor: string | null = restart ? null : state[0].next_cursor;
    if (restart) await pool.execute("UPDATE ai_usage_sync_ranges SET next_cursor = NULL, complete = 0 WHERE range_key = ?", [key]);
    for (let page = 0; page < 3; page++) {
      signal?.throwIfAborted();
      const url = new URL("https://api.replicate.com/v1/predictions");
      url.searchParams.set("created_after", filters.from);
      url.searchParams.set("created_before", filters.to);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new AiUsageSyncError(response.status === 429
        ? "Replicate rate limit reached. Wait a moment, then continue syncing."
        : `Could not read Replicate history (HTTP ${response.status}).`, response.status === 429 ? 429 : 502);
      const body = await response.json();
      if (!Array.isArray(body.results)) throw new AiUsageSyncError("Replicate returned invalid prediction data.", 502);
      const next = replicateNextCursor(body.next);
      if (next && next === cursor) throw new AiUsageSyncError("Replicate returned a repeated cursor.", 502);
      for (let offset = 0; offset < body.results.length; offset += 10) {
        const saved = await Promise.all(body.results.slice(offset, offset + 10).map((p: unknown) => saveAiPrediction(p)));
        imported += saved.filter(Boolean).length;
      }
      cursor = next;
      const [progress] = await pool.execute<ResultSetHeader>(`UPDATE ai_usage_sync_ranges SET next_cursor = ?, complete = ?, updated_at = UTC_TIMESTAMP(3),
        lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 120 SECOND)
        WHERE range_key = ? AND lease_owner = ?`, [cursor, cursor ? 0 : 1, key, owner]);
      if (!progress.affectedRows) throw new AiUsageSyncError("Sync ownership expired. Continue syncing to resume saved progress.", 409);
      if (!cursor) return { imported, complete: true };
    }
    return { imported, complete: false };
  } finally {
    await pool.execute("UPDATE ai_usage_sync_ranges SET lease_until = NULL, lease_owner = NULL WHERE range_key = ? AND lease_owner = ?", [key, owner]);
  }
}
