import "server-only";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { CepApplyStatus, CepDiagnosticDetail, CepDiagnosticList, CepDiagnosticPayload, CepDiagnosticSummary } from "@/lib/cep-diagnostics-shared";

export const MAX_DIAGNOSTIC_BYTES = 512 * 1024;
const TABLE = "cep_apply_reports";
const statusSchema = z.enum(["applied", "failed", "media-missing"]);
const payloadSchema = z.object({
  schemaVersion: z.literal(1),
  reportId: z.string().uuid(),
  installationId: z.string().uuid(),
  client: z.literal("gal-toolkit-max-legacy"),
  event: z.literal("element.apply"),
  occurredAt: z.string().datetime(),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  item: z.object({ name: z.string().max(255).optional() }).passthrough(),
  result: z.object({
    status: statusSchema,
    relink: z.object({ pending: z.array(z.unknown()).max(1000).optional(), unresolved: z.array(z.unknown()).max(1000).optional() }).passthrough().optional(),
  }).passthrough(),
  context: z.object({
    extension: z.object({ version: z.string().min(1).max(64) }).passthrough(),
    host: z.object({ appVersion: z.string().min(1).max(64), appId: z.string().max(64).optional() }).passthrough(),
    user: z.object({ email: z.string().max(191).nullable().optional(), name: z.string().max(191).nullable().optional(), localUser: z.string().max(191).optional() }).optional(),
    pack: z.object({ name: z.string().max(255).optional(), version: z.string().max(64).optional(), path: z.string().max(4096).optional() }).passthrough().nullable().optional(),
    settings: z.unknown().optional(),
  }).passthrough(),
  logs: z.array(z.object({ sequence: z.number().optional(), time: z.string().max(64), level: z.string().max(32), data: z.unknown() })).max(250),
});

const secretKey = /password|passwd|token|secret|authorization|cookie|private.?key|usid|cachedUsp|fingerprint|purchase.?code|license.?key/i;
function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[depth limit]";
  if (typeof value === "string") return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bmfcep_[A-Za-z0-9]+\b/g, "[redacted]")
    .replace(/((?:password|passwd|token|secret|authorization|usid|cachedUsp|purchase_code|license_key)[\\"'\s]*[:=][\\"'\s]*)([^"'\s,;&}\]]+)/gi, "$1[redacted]");
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !["__proto__", "constructor", "prototype"].includes(key))
    .map(([key, item]) => [key, secretKey.test(key) ? "[redacted]" : redact(item, depth + 1)]));
  return value;
}

export function parseCepDiagnostic(value: unknown): CepDiagnosticPayload | null {
  const parsed = payloadSchema.safeParse(value);
  return parsed.success ? redact(parsed.data) as CepDiagnosticPayload : null;
}

let schema: Promise<unknown> | undefined;
async function ensureSchema() {
  if (!schema) schema = getPool().query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    report_id CHAR(36) NOT NULL PRIMARY KEY,
    installation_id CHAR(36) NOT NULL,
    received_at DATETIME(3) NOT NULL,
    occurred_at DATETIME(3) NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    reported_email VARCHAR(191) NULL,
    item_name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL,
    extension_version VARCHAR(64) NOT NULL,
    host_version VARCHAR(64) NOT NULL,
    duration_ms INT UNSIGNED NOT NULL,
    missing_count INT UNSIGNED NOT NULL DEFAULT 0,
    payload JSON NOT NULL,
    KEY idx_cep_apply_received (received_at, report_id),
    KEY idx_cep_apply_status (status, received_at),
    KEY idx_cep_apply_email (reported_email, received_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).catch(error => { schema = undefined; throw error; });
  await schema;
}

function sqlDate(value: string) { return new Date(value).toISOString().slice(0, 23).replace("T", " "); }

export async function storeCepDiagnostic(payload: CepDiagnosticPayload, verifiedUserId: number | null) {
  await ensureSchema();
  const missing = (payload.result.relink?.pending?.length || 0) + (payload.result.relink?.unresolved?.length || 0);
  await getPool().execute(`INSERT IGNORE INTO ${TABLE}
    (report_id, installation_id, received_at, occurred_at, user_id, reported_email, item_name, status,
     extension_version, host_version, duration_ms, missing_count, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    payload.reportId, payload.installationId, sqlDate(new Date().toISOString()), sqlDate(payload.occurredAt),
    verifiedUserId, payload.context.user?.email || null, payload.item.name || "Unnamed element", payload.result.status,
    payload.context.extension.version, payload.context.host.appVersion, payload.durationMs, missing, JSON.stringify(payload),
  ]);
}

type ReportRow = RowDataPacket & {
  reportId: string; receivedAt: string; occurredAt: string; userEmail: string | null; verifiedUserId: number | null;
  itemName: string; status: CepApplyStatus; extensionVersion: string; hostVersion: string; durationMs: number; missingCount: number;
};
const summaryColumns = `report_id AS reportId,
  DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%sZ') AS receivedAt,
  DATE_FORMAT(occurred_at, '%Y-%m-%dT%H:%i:%sZ') AS occurredAt,
  reported_email AS userEmail, user_id AS verifiedUserId, item_name AS itemName, status,
  extension_version AS extensionVersion, host_version AS hostVersion, duration_ms AS durationMs, missing_count AS missingCount`;

export async function listCepDiagnostics(params: URLSearchParams): Promise<CepDiagnosticList> {
  await ensureSchema();
  const page = Math.max(1, Math.min(100000, Number.parseInt(params.get("page") || "1", 10) || 1));
  const pageSize = 25;
  const days = [1, 7, 30].includes(Number(params.get("days"))) ? Number(params.get("days")) : 7;
  const where = [`received_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${days} DAY)`];
  const values: (number | string)[] = [];
  const status = statusSchema.safeParse(params.get("status"));
  if (status.success) { where.push("status = ?"); values.push(status.data); }
  const q = (params.get("q") || "").trim().slice(0, 120);
  if (q) { where.push("(reported_email LIKE ? OR item_name LIKE ? OR host_version LIKE ? OR extension_version LIKE ? OR report_id = ?)"); values.push(...Array(4).fill(`%${q}%`), q); }
  const clause = where.join(" AND ");
  const pool = getPool();
  const [[counts], [reports]] = await Promise.all([
    pool.execute<(RowDataPacket & { total: number })[]>(`SELECT COUNT(*) AS total FROM ${TABLE} WHERE ${clause}`, values),
    pool.execute<ReportRow[]>(`SELECT ${summaryColumns} FROM ${TABLE} WHERE ${clause} ORDER BY received_at DESC, report_id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, values),
  ]);
  return { reports: reports as CepDiagnosticSummary[], total: Number(counts[0]?.total || 0), page, pageSize };
}

export async function getCepDiagnostic(id: string): Promise<CepDiagnosticDetail | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  await ensureSchema();
  const [rows] = await getPool().execute<(ReportRow & { payload: string | CepDiagnosticPayload })[]>(`SELECT ${summaryColumns}, payload FROM ${TABLE} WHERE report_id = ?`, [id]);
  const row = rows[0];
  if (!row) return null;
  return { ...row, payload: typeof row.payload === "string" ? JSON.parse(row.payload) as CepDiagnosticPayload : row.payload };
}
