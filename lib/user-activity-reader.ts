import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getMarketItemsByIds } from "@/lib/market-items";
import { ensureUserActivitySchema } from "@/lib/user-activity";
import type { ActivityCategory, ActivityDetails, UserActivityEntry, UserActivityPage } from "@/lib/user-activity-shared";

const ORIGINS = ["event", "download", "generation", "session"] as const;
type Origin = typeof ORIGINS[number];
type Cursor = { time: string; origin: Origin; id: string };
type ActivityRow = RowDataPacket & Omit<UserActivityEntry, "id" | "details"> & {
  rowId: string; details: ActivityDetails | string | null; sortTime: string;
};
type SortedEntry = UserActivityEntry & { cursor: Cursor };
const PAGE_SIZE = 50;

export function decodeActivityCursor(value: string): Cursor | null {
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || !ORIGINS.includes(parsed.origin) ||
      typeof parsed.id !== "string" || !/^[1-9]\d{0,19}$/.test(parsed.id) ||
      BigInt(parsed.id) > BigInt("18446744073709551615") ||
      typeof parsed.time !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(parsed.time)) return null;
    const date = new Date(parsed.time.replace(" ", "T").slice(0, 23) + "Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 23).replace("T", " ") !== parsed.time.slice(0, 23)) return null;
    return { time: parsed.time, origin: parsed.origin, id: parsed.id };
  } catch { return null; }
}

function beforeCursor(origin: Origin, column: string, cursor?: Cursor) {
  if (!cursor) return { sql: "", params: [] as string[] };
  const rank = ORIGINS.indexOf(origin) - ORIGINS.indexOf(cursor.origin);
  return {
    sql: ` AND (${column} < ? OR (${column} = ? AND ${rank > 0 ? "1 = 1" : rank < 0 ? "1 = 0" : "id < ?"}))`,
    params: [cursor.time, cursor.time, ...(rank === 0 ? [cursor.id] : [])],
  };
}

function normalized(row: ActivityRow, origin: Origin): SortedEntry {
  let details: ActivityDetails = {};
  try { details = typeof row.details === "string" ? JSON.parse(row.details) : row.details ?? {}; } catch { /* old malformed details */ }
  return {
    id: `${origin}:${row.rowId}`, category: row.category, action: row.action,
    resourceType: row.resourceType, resourceId: row.resourceId == null ? null : String(row.resourceId),
    resourceName: row.resourceName, source: row.source,
    deviceId: row.deviceId == null ? null : String(row.deviceId), status: row.status, details,
    createdAt: row.sortTime.replace(" ", "T"),
    cursor: { time: row.sortTime, origin, id: String(row.rowId) },
  };
}

export async function listUserActivity(
  userId: number, options: { cursor?: Cursor; category?: ActivityCategory } = {},
): Promise<UserActivityPage> {
  await ensureUserActivitySchema();
  const pool = getPool();
  const sources: { origin: Origin; sql: string; params: (number | string)[] }[] = [];
  const date = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d %H:%i:%s.%f') AS sortTime`;
  const add = (origin: Origin, select: string, where: string, dateColumn: string, category?: ActivityCategory) => {
    if (category && options.category && options.category !== category) return;
    const before = beforeCursor(origin, dateColumn, options.cursor);
    // Legacy Laravel timestamps may be NULL or zero dates; do not invent a time for those rows.
    sources.push({ origin, sql: `${select} WHERE ${where} AND ${dateColumn} >= '1000-01-01'${before.sql} ORDER BY ${dateColumn} DESC, id DESC LIMIT ${PAGE_SIZE + 1}`,
      params: [userId, ...(origin === "event" && options.category ? [options.category] : []), ...before.params] });
  };
  add("event", `SELECT CAST(id AS CHAR) AS rowId, category, action, resource_type AS resourceType,
    resource_id AS resourceId, resource_name AS resourceName, source, CAST(device_id AS CHAR) AS deviceId,
    status, details, ${date("created_at")} FROM user_activity`,
    `user_id = ?${options.category ? " AND category = ?" : ""}`, "created_at");
  add("download", `SELECT CAST(sd.id AS CHAR) AS rowId, 'download' AS category, 'marketplace_download' AS action,
    'marketplace_item' AS resourceType, CAST(item_id AS CHAR) AS resourceId, NULL AS resourceName,
    'unknown' AS source, NULL AS deviceId, 'unknown' AS status, NULL AS details, ${date("sd.created_at")}
    FROM subscription_downloads sd`,
    "sd.user_id = ? AND NOT EXISTS (SELECT 1 FROM user_activity a WHERE a.legacy_download_id = sd.id)", "sd.created_at", "download");
  add("generation", `SELECT CAST(id AS CHAR) AS rowId, 'generation' AS category, 'generation' AS action,
    'tool' AS resourceType, tool AS resourceId, NULL AS resourceName,
    CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(settings, '$._activity_source')) IN ('web', 'extension')
      THEN JSON_UNQUOTE(JSON_EXTRACT(settings, '$._activity_source'))
      WHEN JSON_UNQUOTE(JSON_EXTRACT(settings, '$.source')) LIKE 'cep-%' THEN 'extension' ELSE 'unknown' END AS source,
    NULL AS deviceId, CASE WHEN status = 'ok' THEN 'ok' ELSE 'failed' END AS status,
    NULL AS details, ${date("created_at")} FROM generation_records`, "user_id = ?", "created_at", "generation");
  add("session", `SELECT CAST(id AS CHAR) AS rowId, 'extension' AS category, 'extension_session' AS action,
    'extension' AS resourceType, client AS resourceId, host_app_name AS resourceName,
    'extension' AS source, CAST(device_id AS CHAR) AS deviceId, 'observed' AS status,
    JSON_OBJECT('client', client, 'host', CONCAT(host_app_id, ' ', host_version), 'version', extension_version) AS details,
    ${date("reported_at")} FROM cep_client_sessions`, "user_id = ?", "reported_at", "extension");

  const results = await Promise.allSettled(sources.map(async ({ origin, sql, params }) => {
    const [rows] = await pool.execute<ActivityRow[]>(sql, params);
    return rows.map((row) => normalized(row, origin));
  }));
  const entries: SortedEntry[] = [];
  const unavailableSources: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") { entries.push(...result.value); return; }
    // Older installations may not have every legacy feature enabled.
    if (sources[i].origin !== "event" && result.reason?.code === "ER_NO_SUCH_TABLE") {
      unavailableSources.push(sources[i].origin);
    } else { throw result.reason; }
  });
  entries.sort((a, b) => {
    const time = b.cursor.time.localeCompare(a.cursor.time);
    if (time) return time;
    const origin = ORIGINS.indexOf(a.cursor.origin) - ORIGINS.indexOf(b.cursor.origin);
    if (origin) return origin;
    return BigInt(a.cursor.id) > BigInt(b.cursor.id) ? -1 : BigInt(a.cursor.id) < BigInt(b.cursor.id) ? 1 : 0;
  });
  const page = entries.slice(0, PAGE_SIZE);
  const legacyItems = page.filter((entry) => entry.cursor.origin === "download");
  if (legacyItems.length) {
    const products = await getMarketItemsByIds([...new Set(legacyItems.map((entry) => Number(entry.resourceId)))]);
    const names = new Map(products.map((product) => [String(product.id), product.name]));
    for (const entry of legacyItems) entry.resourceName = names.get(entry.resourceId!) ?? null;
  }
  return {
    entries: page.map(({ cursor: _cursor, ...entry }) => entry),
    nextCursor: entries.length > PAGE_SIZE ? Buffer.from(JSON.stringify(page[page.length - 1].cursor)).toString("base64url") : null,
    unavailableSources,
  };
}
