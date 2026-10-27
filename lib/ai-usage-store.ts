import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { createHash } from "node:crypto";
import { AI_ACCOUNTS, AI_STATUSES, type AiUsageFilters, type AiUsageIdentity,
  type AiUsageOverview, type AiUsageTotals, aiAccountForUser } from "@/lib/ai-usage-shared";

let schema: Promise<void> | undefined;
export async function ensureAiUsageSchema(): Promise<void> {
  if (!schema) schema = (async () => {
    await getPool().query(`CREATE TABLE IF NOT EXISTS ai_usage_predictions (
      prediction_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      account_key VARCHAR(32) NOT NULL DEFAULT 'unknown',
      model VARCHAR(255) NOT NULL, status VARCHAR(16) NOT NULL,
      created_at DATETIME(3) NOT NULL, completed_at DATETIME(3) NULL,
      predict_seconds DOUBLE NULL, total_seconds DOUBLE NULL,
      input_tokens BIGINT UNSIGNED NULL, output_tokens BIGINT UNSIGNED NULL,
      user_ref VARCHAR(191) NULL, client VARCHAR(64) NULL,
      observed_at DATETIME(3) NOT NULL,
      KEY idx_created (created_at, prediction_id), KEY idx_account_created (account_key, created_at),
      KEY idx_model_created (model, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await getPool().query(`CREATE TABLE IF NOT EXISTS ai_usage_sync_ranges (
      range_key CHAR(64) CHARACTER SET ascii PRIMARY KEY,
      next_cursor TEXT NULL, complete TINYINT NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NULL, lease_until DATETIME(3) NULL, lease_owner CHAR(36) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  })().catch(error => { schema = undefined; throw error; });
  await schema;
}

export const sqlDate = (iso: string) => new Date(iso).toISOString().slice(0, 23).replace("T", " ");
export const rangeKey = (from: string, to: string) => createHash("sha256").update(`${from}|${to}`).digest("hex");
const nonnegative = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const tokenCount = (value: unknown) => {
  const number = nonnegative(value); return number !== null && Number.isSafeInteger(number) ? number : null;
};
function date(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? sqlDate(value) : null;
}
/** Store metadata only: prompts, output, API tokens and provider logs are excluded. */
export async function saveAiPrediction(raw: unknown, user?: AiUsageIdentity): Promise<boolean> {
  if (!raw || typeof raw !== "object") return false;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(p.id) ||
      typeof p.model !== "string" || !p.model || p.model.length > 255 ||
      !AI_STATUSES.includes(p.status as typeof AI_STATUSES[number]) || !date(p.created_at)) return false;
  const metrics = p.metrics && typeof p.metrics === "object" ? p.metrics as Record<string, unknown> : {};
  await ensureAiUsageSchema();
  await getPool().execute(`INSERT INTO ai_usage_predictions
    (prediction_id, account_key, model, status, created_at, completed_at, predict_seconds,
     total_seconds, input_tokens, output_tokens, user_ref, client, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      account_key = IF(VALUES(account_key) = 'unknown', account_key, VALUES(account_key)),
      model = VALUES(model),
      status = IF(status IN ('succeeded','failed','canceled','aborted') AND VALUES(status) IN ('starting','processing'), status, VALUES(status)),
      completed_at = COALESCE(VALUES(completed_at), completed_at),
      predict_seconds = COALESCE(VALUES(predict_seconds), predict_seconds),
      total_seconds = COALESCE(VALUES(total_seconds), total_seconds),
      input_tokens = COALESCE(VALUES(input_tokens), input_tokens),
      output_tokens = COALESCE(VALUES(output_tokens), output_tokens),
      user_ref = COALESCE(VALUES(user_ref), user_ref), client = COALESCE(VALUES(client), client),
      observed_at = UTC_TIMESTAMP(3)`, [p.id, user ? aiAccountForUser(user) : "unknown", p.model, String(p.status),
    date(p.created_at), date(p.completed_at), nonnegative(metrics.predict_time), nonnegative(metrics.total_time),
    tokenCount(metrics.input_token_count ?? metrics.token_input_count),
    tokenCount(metrics.output_token_count ?? metrics.token_output_count),
    user?.id == null ? null : `${user.source === "odin-bearer" ? "" : "mf:"}${user.id}`.slice(0, 191),
    user?.cepClient?.slice(0, 64) ?? null]);
  return true;
}

export function parseAiUsageFilters(params: URLSearchParams): AiUsageFilters | null {
  const from = params.get("from"), to = params.get("to");
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(to)) return null;
  const start = Date.parse(from), end = Date.parse(to);
  const account = params.get("account") || "", model = params.get("model") || "", status = params.get("status") || "";
  const page = Number(params.get("page") || 1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 366 * 86400000 ||
      (account && account !== "unknown" && !AI_ACCOUNTS.some(item => item.id === account)) ||
      (status && !AI_STATUSES.includes(status as typeof AI_STATUSES[number])) ||
      model.length > 255 || !Number.isSafeInteger(page) || page < 1 || page > 100000) return null;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString(), account, model, status, page };
}

const aggregates = `COUNT(*) AS total, COALESCE(SUM(status = 'succeeded'),0) AS succeeded,
  COALESCE(SUM(status = 'failed'),0) AS failed, COALESCE(SUM(status IN ('starting','processing')),0) AS active,
  COALESCE(SUM(status IN ('canceled','aborted')),0) AS canceled,
  COALESCE(SUM(predict_seconds),0) AS predictSeconds, COUNT(predict_seconds) AS measured,
  COALESCE(SUM(input_tokens),0) AS inputTokens, COALESCE(SUM(output_tokens),0) AS outputTokens,
  COUNT(input_tokens) AS inputMeasured, COUNT(output_tokens) AS outputMeasured`;
function totals(row: Record<string, unknown> = {}): AiUsageTotals {
  return Object.fromEntries(["total", "succeeded", "failed", "active", "canceled", "predictSeconds", "measured", "inputTokens", "outputTokens", "inputMeasured", "outputMeasured"]
    .map(key => [key, Number(row[key] || 0)])) as AiUsageTotals;
}
export async function readAiUsage(filters: AiUsageFilters): Promise<AiUsageOverview> {
  await ensureAiUsageSchema();
  const clauses = ["created_at >= ?", "created_at < ?"], values: (string | number)[] = [sqlDate(filters.from), sqlDate(filters.to)];
  // Model choices cover the whole time window, so changing author never hides the current choice.
  const modelValues = [...values];
  for (const [column, value] of [["account_key", filters.account], ["model", filters.model], ["status", filters.status]]) {
    if (value) { clauses.push(`${column} = ?`); values.push(value); }
  }
  const where = clauses.join(" AND ");
  const pool = getPool();
  const [summary, groups, records, models, sync] = await Promise.all([
    pool.execute<RowDataPacket[]>(`SELECT ${aggregates} FROM ai_usage_predictions WHERE ${where}`, values),
    pool.execute<RowDataPacket[]>(`SELECT account_key, ${aggregates} FROM ai_usage_predictions WHERE ${where} GROUP BY account_key`, values),
    pool.execute<RowDataPacket[]>(`SELECT prediction_id AS id, account_key AS account, model, status,
      DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS createdAt,
      DATE_FORMAT(completed_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS completedAt,
      predict_seconds AS predictSeconds, total_seconds AS totalSeconds, input_tokens AS inputTokens,
      output_tokens AS outputTokens, user_ref AS userRef, client
      FROM ai_usage_predictions WHERE ${where} ORDER BY created_at DESC, prediction_id DESC LIMIT 50 OFFSET ${(filters.page - 1) * 50}`, values),
    pool.execute<RowDataPacket[]>("SELECT DISTINCT model FROM ai_usage_predictions WHERE created_at >= ? AND created_at < ? ORDER BY model", modelValues),
    pool.execute<RowDataPacket[]>(`SELECT complete, DATE_FORMAT(updated_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS updatedAt,
      lease_until > UTC_TIMESTAMP(3) AS running FROM ai_usage_sync_ranges WHERE range_key = ?`, [rangeKey(filters.from, filters.to)]),
  ]);
  const result = totals(summary[0][0]);
  return { totals: result,
    accounts: [...AI_ACCOUNTS.map(account => ({ id: account.id, configured: Boolean(process.env[account.env]?.trim()),
      ...totals(groups[0].find(row => row.account_key === account.id)) })),
      { id: "unknown", configured: true, ...totals(groups[0].find(row => row.account_key === "unknown")) }],
    rows: records[0].map(row => ({ ...row, predictSeconds: row.predictSeconds == null ? null : Number(row.predictSeconds),
      totalSeconds: row.totalSeconds == null ? null : Number(row.totalSeconds),
      inputTokens: row.inputTokens == null ? null : Number(row.inputTokens),
      outputTokens: row.outputTokens == null ? null : Number(row.outputTokens) })) as AiUsageOverview["rows"],
    models: models[0].map(row => String(row.model)), total: result.total, page: filters.page, pageSize: 50,
    sync: { complete: Boolean(sync[0][0]?.complete), updatedAt: sync[0][0]?.updatedAt ?? null, running: Boolean(sync[0][0]?.running) },
    canSync: Boolean(process.env.REPLICATE_API_TOKEN?.trim()), generatedAt: new Date().toISOString() };
}
