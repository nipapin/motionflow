export const AI_ACCOUNTS = [
  { id: "default", label: "Motion Flow", env: "REPLICATE_API_TOKEN" },
  { id: "spunkram", label: "Spunkram Library", env: "REPLICATE_SPUNKRAM_API_TOKEN" },
  { id: "toolkit", label: "Gal Toolkit MAX", env: "REPLICATE_TOOLKIT_API_TOKEN" },
  { id: "odinpro", label: "Odin Pro", env: "REPLICATE_ODINPRO_API_TOKEN" },
] as const;
export type AiAccount = typeof AI_ACCOUNTS[number]["id"];
export type AiUsageIdentity = { id?: number | string; source?: string; cepClient?: string };
export function aiAccountForUser(user: AiUsageIdentity): AiAccount {
  if (user.cepClient === "spunkram-cep") return "spunkram";
  if (user.cepClient === "gal-cep") return "toolkit";
  if (user.cepClient === "odin-cep" || user.source === "odin-bearer") return "odinpro";
  return "default";
}
export const AI_STATUSES = ["starting", "processing", "succeeded", "failed", "canceled", "aborted"] as const;
export type AiUsageFilters = { from: string; to: string; account: string; model: string; status: string; page: number };
export type AiUsageTotals = {
  total: number; succeeded: number; failed: number; active: number; canceled: number;
  predictSeconds: number; measured: number; inputTokens: number; outputTokens: number;
  inputMeasured: number; outputMeasured: number;
};
export type AiUsageRow = {
  id: string; account: string; model: string; status: string; createdAt: string;
  completedAt: string | null; predictSeconds: number | null; totalSeconds: number | null;
  inputTokens: number | null; outputTokens: number | null; userRef: string | null; client: string | null;
};
export type AiSyncState = { complete: boolean; updatedAt: string | null; running: boolean };
export type AiUsageOverview = {
  totals: AiUsageTotals; accounts: (AiUsageTotals & { id: string; configured: boolean })[];
  rows: AiUsageRow[]; models: string[]; total: number; page: number; pageSize: number;
  sync: AiSyncState; canSync: boolean; generatedAt: string;
};
