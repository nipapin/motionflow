import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import { getPool, withDbRetry } from "@/lib/db";
import {
  configuredSpunkramEnvironment,
  readSpunkramCredentials,
} from "@/lib/paddle-accounting/spunkram-credentials.mjs";
import type { SpunkramPaddleEnvironment } from "@/lib/spunkram-paddle-config";

export const spunkramLocalSandbox =
  process.env.NODE_ENV === "development" &&
  process.env.SPUNKRAM_LOCAL_SANDBOX === "1" &&
  configuredSpunkramEnvironment() === "sandbox";

export async function getSpunkramPaddleCredentials(
  environment: SpunkramPaddleEnvironment = configuredSpunkramEnvironment(),
  allowEnvFallback = true,
) {
  if (spunkramLocalSandbox && environment === "sandbox") {
    const apiKey = process.env.SPUNKRAM_PADDLE_API_KEY?.trim() ?? "";
    const clientToken = process.env.NEXT_PUBLIC_SPUNKRAM_PADDLE_CLIENT_TOKEN?.trim() ?? "";
    return {
      apiKey: apiKey.startsWith("pdl_sdbx_") ? apiKey : "",
      clientToken: clientToken.startsWith("test_") ? clientToken : "",
      webhookSecret: process.env.SPUNKRAM_PADDLE_WEBHOOK_SECRET?.trim() ?? "",
    };
  }
  return withDbRetry(() => readSpunkramCredentials(getPool(), environment, allowEnvFallback));
}

export async function isSpunkramCheckoutEnabled(): Promise<boolean> {
  try {
    const [rows] = await withDbRetry(() => getPool().execute<(RowDataPacket & { enabled: number })[]>(
      "SELECT enabled FROM spunkram_storefront_settings WHERE id IN (1, 2) ORDER BY id DESC LIMIT 1",
    ));
    return Number(rows[0]?.enabled) === 1;
  } catch (error) {
    if ((error as { code?: string }).code === "ER_NO_SUCH_TABLE") return false;
    throw error;
  }
}
