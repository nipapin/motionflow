import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

export const CEP_ERROR_REPORTS_TABLE = "cep_error_reports";

let schemaEnsured = false;

export type CepErrorReportInsert = {
  userId: number;
  deviceId: number | null;
  client: string;
  action: string;
  error: string;
  errorCode?: string | null;
  severity: "error" | "warning" | "info";
  stack?: string | null;
  extensionVersion?: string | null;
  hostAppId?: string | null;
  hostAppName?: string | null;
  hostVersion?: string | null;
  os?: string | null;
  locale?: string | null;
  extra?: Record<string, string | number | boolean | null> | null;
  occurredAt: string;
};

export type CepErrorReportSummary = {
  id: number;
  action: string;
  error: string;
  error_code: string | null;
  severity: string;
  occurred_at: string;
};

async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${CEP_ERROR_REPORTS_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`user_id\` BIGINT UNSIGNED NOT NULL,
       \`device_id\` BIGINT UNSIGNED NULL,
       \`client\` VARCHAR(64) NOT NULL,
       \`action\` VARCHAR(200) NOT NULL,
       \`error\` TEXT NOT NULL,
       \`error_code\` VARCHAR(128) NULL,
       \`severity\` VARCHAR(16) NOT NULL DEFAULT 'error',
       \`stack\` TEXT NULL,
       \`extension_version\` VARCHAR(64) NULL,
       \`host_app_id\` VARCHAR(64) NULL,
       \`host_app_name\` VARCHAR(64) NULL,
       \`host_version\` VARCHAR(64) NULL,
       \`os\` VARCHAR(500) NULL,
       \`locale\` VARCHAR(32) NULL,
       \`extra\` JSON NULL,
       \`occurred_at\` DATETIME NOT NULL,
       \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       KEY \`idx_cep_error_reports_device\` (\`device_id\`, \`occurred_at\`),
       KEY \`idx_cep_error_reports_user\` (\`user_id\`, \`occurred_at\`),
       KEY \`idx_cep_error_reports_client\` (\`client\`, \`occurred_at\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  schemaEnsured = true;
}

export async function ensureCepErrorReportsSchema(): Promise<void> {
  await ensureSchema();
}

export async function insertCepErrorReport(
  report: CepErrorReportInsert,
): Promise<number> {
  await ensureSchema();
  const pool = getPool();
  const extraJson =
    report.extra && Object.keys(report.extra).length > 0
      ? JSON.stringify(report.extra)
      : null;

  const occurredAt = normalizeOccurredAt(report.occurredAt);

  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO \`${CEP_ERROR_REPORTS_TABLE}\`
       (user_id, device_id, client, action, error, error_code, severity, stack,
        extension_version, host_app_id, host_app_name, host_version, os, locale,
        extra, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.userId,
      report.deviceId,
      report.client.slice(0, 64),
      report.action.slice(0, 200),
      report.error.slice(0, 4000),
      report.errorCode?.slice(0, 128) ?? null,
      report.severity,
      report.stack?.slice(0, 4000) ?? null,
      report.extensionVersion?.slice(0, 64) ?? null,
      report.hostAppId?.slice(0, 64) ?? null,
      report.hostAppName?.slice(0, 64) ?? null,
      report.hostVersion?.slice(0, 64) ?? null,
      report.os?.slice(0, 500) ?? null,
      report.locale?.slice(0, 32) ?? null,
      extraJson,
      occurredAt,
    ],
  );
  return Number(res.insertId);
}

function normalizeOccurredAt(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Last `perDevice` errors for each device id (newest first).
 */
export async function listRecentErrorsForDevices(
  deviceIds: number[],
  perDevice = 5,
): Promise<Map<number, CepErrorReportSummary[]>> {
  const out = new Map<number, CepErrorReportSummary[]>();
  if (deviceIds.length === 0) return out;
  await ensureSchema();
  const pool = getPool();
  const placeholders = deviceIds.map(() => "?").join(",");
  type Row = RowDataPacket & {
    id: number;
    device_id: number;
    action: string;
    error: string;
    error_code: string | null;
    severity: string;
    occurred_at: string | Date;
  };
  // MySQL 8 window function for top-N per device
  const [rows] = await pool.execute<Row[]>(
    `SELECT id, device_id, action, error, error_code, severity, occurred_at
     FROM (
       SELECT id, device_id, action, error, error_code, severity, occurred_at,
              ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY occurred_at DESC, id DESC) AS rn
       FROM \`${CEP_ERROR_REPORTS_TABLE}\`
       WHERE device_id IN (${placeholders})
     ) t
     WHERE rn <= ?
     ORDER BY device_id ASC, occurred_at DESC, id DESC`,
    [...deviceIds, perDevice],
  );

  for (const r of rows) {
    const deviceId = Number(r.device_id);
    const list = out.get(deviceId) ?? [];
    list.push({
      id: Number(r.id),
      action: r.action,
      error: r.error,
      error_code: r.error_code,
      severity: r.severity,
      occurred_at:
        r.occurred_at instanceof Date
          ? r.occurred_at.toISOString()
          : String(r.occurred_at),
    });
    out.set(deviceId, list);
  }
  return out;
}

export async function countErrorsForDevices(
  deviceIds: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (deviceIds.length === 0) return out;
  await ensureSchema();
  const pool = getPool();
  const placeholders = deviceIds.map(() => "?").join(",");
  type Row = RowDataPacket & { device_id: number; cnt: number };
  const [rows] = await pool.execute<Row[]>(
    `SELECT device_id, COUNT(*) AS cnt
     FROM \`${CEP_ERROR_REPORTS_TABLE}\`
     WHERE device_id IN (${placeholders})
     GROUP BY device_id`,
    deviceIds,
  );
  for (const r of rows) {
    out.set(Number(r.device_id), Number(r.cnt));
  }
  return out;
}
