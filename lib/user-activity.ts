import "server-only";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { ActivityCategory, ActivityDetails, ActivitySource, ActivityStatus } from "@/lib/user-activity-shared";

let schemaReady: Promise<void> | undefined;
export async function ensureUserActivitySchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool().query(`CREATE TABLE IF NOT EXISTS user_activity (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      category VARCHAR(24) NOT NULL, action VARCHAR(64) NOT NULL,
      resource_type VARCHAR(32) NOT NULL, resource_id VARCHAR(191) NULL,
      resource_name VARCHAR(255) NULL, source VARCHAR(16) NOT NULL,
      device_id BIGINT UNSIGNED NULL, status VARCHAR(24) NOT NULL, details JSON NOT NULL,
      legacy_download_id BIGINT UNSIGNED NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_activity_download (legacy_download_id),
      KEY idx_activity_user_date (user_id, created_at, id),
      KEY idx_activity_user_category_date (user_id, category, created_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
      .then(() => undefined).catch((error) => { schemaReady = undefined; throw error; });
  }
  return schemaReady;
}

export type ActivityInput = {
  userId: number;
  category: ActivityCategory;
  action: string;
  resourceType: string;
  resourceId?: string | number | null;
  resourceName?: string | null;
  source: ActivitySource;
  deviceId?: number | null;
  status: ActivityStatus;
  details?: ActivityDetails;
};

/** Awaited but fail-open: analytics must not prevent a download or a panel heartbeat. */
export async function recordUserActivity(input: ActivityInput, connection?: PoolConnection): Promise<string | null> {
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0) return null;
  try {
    if (!connection) await ensureUserActivitySchema();
    const [result] = await (connection ?? getPool()).execute<ResultSetHeader>(
      `INSERT INTO user_activity
       (user_id, category, action, resource_type, resource_id, resource_name, source, device_id, status, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.userId, input.category, input.action, input.resourceType,
        input.resourceId == null ? null : String(input.resourceId).slice(0, 191),
        input.resourceName?.slice(0, 255) || null, input.source, input.deviceId ?? null,
        input.status, JSON.stringify(input.details ?? {})],
    );
    return String(result.insertId);
  } catch (error) {
    console.error("[user-activity] write failed", error instanceof Error ? error.name : "Database error");
    return null;
  }
}

export type DownloadActivity = {
  issued: (delivery: NonNullable<ActivityDetails["delivery"]>) => void;
  setResourceName: (name: string) => void;
  linkLegacyDownload: (id: number) => Promise<void>;
};

/** Structured AI tools without generation_records: one event per response, including zero-credit calls. */
export async function withGenerationActivity(
  user: { id: string | number; source: "session" | "cep-bearer" | "odin-bearer"; cepClient?: string },
  tool: string, operation: () => Promise<Response>,
): Promise<Response> {
  const record = async (status: "ok" | "failed", httpStatus: number) => {
    // External account IDs must never collide with Motionflow accounts.
    if (typeof user.id !== "number") return;
    await recordUserActivity({
      userId: user.id, category: "generation", action: "generation", resourceType: "tool", resourceId: tool,
      source: user.source === "session" ? "web" : "extension", status,
      details: { httpStatus, ...(user.cepClient ? { client: user.cepClient } : {}) },
    });
  };
  try {
    const response = await operation();
    await record(response.ok ? "ok" : "failed", response.status);
    return response;
  } catch (error) {
    await record("failed", 500);
    throw error;
  }
}

/** Issued means handed off to storage/browser, never proof of a finished download. */
export async function withDownloadActivity(
  input: Omit<ActivityInput, "category" | "status">,
  operation: (activity: DownloadActivity) => Promise<Response>,
): Promise<Response> {
  const id = await recordUserActivity({ ...input, category: "download", status: "requested" });
  let delivery: ActivityDetails["delivery"];
  let resourceName = input.resourceName?.slice(0, 255) || null;
  const finish = async (status: "issued" | "failed", httpStatus: number) => {
    if (!id) return;
    try {
      await getPool().execute(
        "UPDATE user_activity SET status = ?, details = ?, resource_name = ?, updated_at = NOW(3) WHERE id = ? AND user_id = ?",
        [status, JSON.stringify({ ...input.details, ...(delivery ? { delivery } : {}), httpStatus }), resourceName, id, input.userId],
      );
    } catch { console.error("[user-activity] could not finish download event"); }
  };
  try {
    const response = await operation({
      issued: (value) => { delivery = value; },
      setResourceName: (name) => { resourceName = name.slice(0, 255) || null; },
      linkLegacyDownload: async (downloadId) => {
        if (!id) return;
        try {
          await getPool().execute("UPDATE user_activity SET legacy_download_id = ? WHERE id = ? AND user_id = ?", [downloadId, id, input.userId]);
        } catch { console.error("[user-activity] could not link legacy download"); }
      },
    });
    await finish(delivery && response.status < 400 ? "issued" : "failed", response.status);
    return response;
  } catch (error) {
    await finish("failed", 500);
    throw error;
  }
}
