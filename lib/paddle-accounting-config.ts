import "server-only";

import { getPool, withDbRetry } from "@/lib/db";
import { readAccountingBridgeConfig, readDefaultPaddleEnvironment } from "./paddle-accounting/config.mjs";

export function getDefaultPaddleEnvironment() {
  return withDbRetry(() => readDefaultPaddleEnvironment(getPool()));
}

export function getAccountingBridgeConfig() {
  return withDbRetry(() => readAccountingBridgeConfig(getPool()));
}

export async function getDefaultPaddleCheckoutEnvironment() {
  try {
    return await getDefaultPaddleEnvironment() ?? "sandbox";
  } catch (error) {
    console.error("[paddle] Checkout configuration unavailable", error);
    return null;
  }
}
