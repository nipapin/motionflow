import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

export const CEP_CLIENT_SESSIONS_TABLE = "cep_client_sessions";

/** At most one insert per user+device+host combo per this window (hours). */
export const CEP_SESSION_DEDUPE_HOURS = 12;

let schemaEnsured = false;

export type CepClientSessionReport = {
  userId: number;
  deviceId?: number | null;
  client: string;
  hostAppId: string;
  hostAppName?: string | null;
  hostVersion: string;
  os: string;
  extensionVersion: string;
  locale?: string | null;
  ip?: string | null;
};

async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return;
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${CEP_CLIENT_SESSIONS_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`user_id\` BIGINT UNSIGNED NOT NULL,
       \`device_id\` BIGINT UNSIGNED NULL,
       \`client\` VARCHAR(64) NOT NULL DEFAULT 'spunkram-cep',
       \`host_app_id\` VARCHAR(16) NOT NULL,
       \`host_app_name\` VARCHAR(64) NULL,
       \`host_version\` VARCHAR(64) NOT NULL,
       \`os\` VARCHAR(255) NOT NULL,
       \`extension_version\` VARCHAR(64) NOT NULL,
       \`locale\` VARCHAR(32) NULL,
       \`ip\` VARCHAR(45) NULL,
       \`reported_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       KEY \`idx_cep_client_sessions_user\` (\`user_id\`),
       KEY \`idx_cep_client_sessions_host\` (\`host_app_id\`, \`host_version\`),
       KEY \`idx_cep_client_sessions_os\` (\`os\`(64)),
       KEY \`idx_cep_client_sessions_reported\` (\`reported_at\`),
       KEY \`idx_cep_client_sessions_dedupe\` (\`user_id\`, \`device_id\`, \`host_app_id\`, \`host_version\`, \`extension_version\`, \`reported_at\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  schemaEnsured = true;
}

type RecentRow = RowDataPacket & { id: number };

/**
 * Insert a client-environment report.
 * Dedupes identical user/device/host/os/extension within CEP_SESSION_DEDUPE_HOURS
 * so reopen/recheck does not flood the table.
 * Returns { inserted: true } or { inserted: false, reason: "deduped" }.
 */
export async function recordCepClientSession(
  report: CepClientSessionReport,
): Promise<{ inserted: boolean; reason?: "deduped" }> {
  await ensureSchema();
  const pool = getPool();

  const [recent] = await pool.execute<RecentRow[]>(
    `SELECT id FROM \`${CEP_CLIENT_SESSIONS_TABLE}\`
      WHERE user_id = ?
        AND (device_id <=> ?)
        AND host_app_id = ?
        AND host_version = ?
        AND os = ?
        AND extension_version = ?
        AND reported_at >= (NOW() - INTERVAL ${CEP_SESSION_DEDUPE_HOURS} HOUR)
      LIMIT 1`,
    [
      report.userId,
      report.deviceId ?? null,
      report.hostAppId,
      report.hostVersion,
      report.os,
      report.extensionVersion,
    ],
  );

  if (recent[0]?.id) {
    return { inserted: false, reason: "deduped" };
  }

  await pool.execute<ResultSetHeader>(
    `INSERT INTO \`${CEP_CLIENT_SESSIONS_TABLE}\`
       (user_id, device_id, client, host_app_id, host_app_name, host_version, os, extension_version, locale, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.userId,
      report.deviceId ?? null,
      report.client,
      report.hostAppId,
      report.hostAppName ?? null,
      report.hostVersion,
      report.os,
      report.extensionVersion,
      report.locale ?? null,
      report.ip ?? null,
    ],
  );

  return { inserted: true };
}
