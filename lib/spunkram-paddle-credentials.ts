import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getPool, withDbRetry } from "@/lib/db";
import {
  configuredSpunkramEnvironment,
  readSpunkramCredentials,
} from "@/lib/paddle-accounting/spunkram-credentials.mjs";
import type { SpunkramPaddleEnvironment } from "@/lib/spunkram-paddle-config";

export function getSpunkramPaddleCredentials(
  environment: SpunkramPaddleEnvironment = configuredSpunkramEnvironment(),
) {
  return withDbRetry(() => readSpunkramCredentials(getPool(), environment));
}

export async function isSpunkramStorefrontEnabled(): Promise<boolean> {
  try {
    const [rows] = await withDbRetry(() => getPool().execute<(RowDataPacket & { enabled: number })[]>(
      "SELECT enabled FROM spunkram_storefront_settings WHERE id = 1",
    ));
    return Number(rows[0]?.enabled) === 1;
  } catch (error) {
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return false;
    throw error;
  }
}
