import "server-only";
import { AI_ACCOUNTS, aiAccountForUser, type AiUsageIdentity } from "@/lib/ai-usage-shared";

/** Client identity must come from verified server-side authentication. */
export function getReplicateApiToken(user: AiUsageIdentity): string | undefined {
  const account = AI_ACCOUNTS.find(account => account.id === aiAccountForUser(user))!;
  // Dedicated panels must never fall back to the shared billing account.
  return process.env[account.env]?.trim() || undefined;
}
