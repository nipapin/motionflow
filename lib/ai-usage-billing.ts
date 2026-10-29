import "server-only";
import { getPool } from "@/lib/db";

const billableMetrics = ["image_output_count", "generic_output_count"] as const;
let schema: Promise<void> | undefined;
/** Only numeric billable units are retained. Never store prompts, outputs or logs. */
export async function saveAiBillingMetrics(id: string, metrics: Record<string, unknown>): Promise<void> {
  const units = Object.fromEntries(billableMetrics.flatMap(key => {
    const value = metrics[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? [[key, value]] : [];
  }));
  if (!Object.keys(units).length) return;
  if (!schema) schema = getPool().query(`CREATE TABLE IF NOT EXISTS ai_usage_billing_metrics (
    prediction_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, metrics_json JSON NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`).then(() => {}).catch(error => { schema = undefined; throw error; });
  await schema;
  await getPool().execute(`INSERT INTO ai_usage_billing_metrics (prediction_id, metrics_json) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE metrics_json = JSON_MERGE_PATCH(metrics_json, VALUES(metrics_json))`, [id, JSON.stringify(units)]);
}
