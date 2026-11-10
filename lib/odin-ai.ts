import "server-only";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { ConsumeResult, GenerationStatus } from "@/lib/generations";
import { odinAiOperationContext } from "@/lib/odin-ai-context";

export const ODIN_AI_MONTHLY_LIMIT = 100;
export const ODIN_AI_TRIAL_LIMIT = 5;
export type OdinAiAllocation = {
  version: 2;
  plan: "paid" | "trial" | "blocked";
  limit: number;
  period_id: string | null;
  period_start: string | null;
  period_end: string | null;
};
export type OdinAiUser = {
  id: string; email: string; name: string;
  source: "odin-bearer"; treatAsSubscribed: false; cepClient: "odin-cep";
  odinSubscriptionActive: boolean;
  odinSubscriptionExpiresAt: string | null;
  odinAi: OdinAiAllocation;
};

/** Only a fresh server-to-server Odin response can attest identity, plan or period. */
export async function resolveOdinAiUser(authorization: string): Promise<OdinAiUser | null> {
  if (!/^Bearer odincep_[a-f0-9]{64}$/.test(authorization)) return null;
  const response = await fetch("https://odin-pro.com/api/cep/me?client=odin-cep", {
    headers: { Authorization: authorization },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error("Odin account service unavailable");
  const profile = await response.json();
  const id = String(profile?.user?.id ?? "");
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(id) || typeof profile?.user?.email !== "string") return null;
  const ai = profile.entitlements?.ai;
  if (ai?.version !== 2 || !["paid", "trial", "blocked"].includes(ai.plan)) {
    throw new Error("Odin AI period is unavailable");
  }
  const expectedLimit = ai.plan === "paid" ? ODIN_AI_MONTHLY_LIMIT : ai.plan === "trial" ? ODIN_AI_TRIAL_LIMIT : 0;
  if (ai.limit !== expectedLimit || (ai.plan === "paid" && profile.subscription?.active !== true)) {
    throw new Error("Invalid Odin AI entitlement");
  }
  if (ai.plan !== "blocked" && (typeof ai.period_id !== "string" || !/^[a-f0-9]{64}$/.test(ai.period_id) ||
    typeof ai.period_start !== "string" || typeof ai.period_end !== "string" ||
    !Number.isFinite(Date.parse(ai.period_start)) || !Number.isFinite(Date.parse(ai.period_end)) ||
    Date.parse(ai.period_start) >= Date.parse(ai.period_end))) throw new Error("Invalid Odin AI period");
  return {
    id: `odin:${id}`, email: profile.user.email,
    name: typeof profile.user.name === "string" ? profile.user.name : "",
    source: "odin-bearer", treatAsSubscribed: false, cepClient: "odin-cep",
    odinSubscriptionActive: profile.subscription?.active === true,
    odinSubscriptionExpiresAt: typeof profile.subscription?.renews_at === "string" ? profile.subscription.renews_at : null,
    odinAi: { version: 2, plan: ai.plan, limit: ai.limit, period_id: ai.period_id,
      period_start: ai.period_start, period_end: ai.period_end },
  };
}

function activeAllocation(user: OdinAiUser): boolean {
  const ai = user.odinAi;
  if (!ai || ai.plan === "blocked" || !ai.period_id || !ai.period_start || !ai.period_end) return false;
  const now = Date.now();
  if (!(Date.parse(ai.period_start) <= now && Date.parse(ai.period_end) > now)) return false;
  return ai.plan === "trial" || (user.odinSubscriptionActive && (!user.odinSubscriptionExpiresAt ||
    Date.parse(user.odinSubscriptionExpiresAt) > now));
}

function statusFor(user: OdinAiUser, used: number): GenerationStatus {
  const active = activeAllocation(user);
  const limit = active ? user.odinAi.limit : 0;
  const remaining = Math.max(0, limit - used);
  const paid = active && user.odinAi.plan === "paid";
  return { used, limit, effective_limit: limit, remaining, hasSubscription: paid,
    plan: active ? paid ? "odin" : "odin_trial" : "none", subscription_generations_left: remaining,
    extra_generations_left: 0, total_generations_left: remaining,
    period_id: active ? user.odinAi.period_id : null,
    resets_at: active ? user.odinAi.period_end : null };
}

// A new ledger grants the initial full allocation once, without carrying old UTC-month usage.
const SCHEMA = `CREATE TABLE IF NOT EXISTS odin_ai_period_usage (
  user_id VARCHAR(133) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  period_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  used INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, period_id)
) ENGINE=InnoDB`;
let schemaReady: Promise<void> | undefined;
async function ensureSchema() {
  if (!schemaReady) schemaReady = getPool().query(SCHEMA).then(() => undefined).catch(error => {
    schemaReady = undefined;
    throw error;
  });
  await schemaReady;
}
type UsageRow = RowDataPacket & { used: number };

export async function odinAiStatus(user: OdinAiUser): Promise<GenerationStatus> {
  if (!activeAllocation(user)) return statusFor(user, 0);
  await ensureSchema();
  const [rows] = await getPool().execute<UsageRow[]>(
    "SELECT used FROM odin_ai_period_usage WHERE user_id = ? AND period_id = ?",
    [user.id, user.odinAi.period_id],
  );
  return statusFor(user, Number(rows[0]?.used ?? 0));
}

/** One account/period quota across devices and tools. Client limits are never consulted. */
export async function consumeOdinAi(user: OdinAiUser, amount: number): Promise<ConsumeResult> {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid generation cost");
  if (!activeAllocation(user)) return { ok: false, reason: "limit_reached", status: statusFor(user, 0) };
  if (amount === 0) return { ok: true, status: await odinAiStatus(user) };
  const operation = odinAiOperationContext.getStore();
  if (operation) {
    if (operation.userId !== user.id || operation.periodId !== user.odinAi.period_id) throw new Error("AI operation identity mismatch");
    const status = await odinAiStatus(user);
    const used = status.used + operation.amount + amount;
    if (used > status.limit) return { ok: false, reason: "limit_reached", status };
    operation.amount += amount;
    return { ok: true, status: statusFor(user, used) };
  }
  await ensureSchema();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const period = user.odinAi.period_id;
    // The no-op duplicate update takes an exclusive row lock. INSERT IGNORE can
    // give competing transactions shared locks and deadlock when both increment.
    await conn.execute("INSERT INTO odin_ai_period_usage (user_id, period_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE used=used", [user.id, period]);
    // Check expiry again after waiting for a connection/row lock.
    if (!activeAllocation(user)) {
      await conn.rollback();
      return { ok: false, reason: "limit_reached", status: statusFor(user, 0) };
    }
    const [result] = await conn.execute<ResultSetHeader>(
      "UPDATE odin_ai_period_usage SET used = used + ? WHERE user_id = ? AND period_id = ? AND used + ? <= ?",
      [amount, user.id, period, amount, user.odinAi.limit],
    );
    const [rows] = await conn.execute<UsageRow[]>(
      "SELECT used FROM odin_ai_period_usage WHERE user_id = ? AND period_id = ?", [user.id, period],
    );
    const status = statusFor(user, Number(rows[0].used));
    await conn.commit();
    return result.affectedRows === 1 ? { ok: true, status } : { ok: false, reason: "limit_reached", status };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}
