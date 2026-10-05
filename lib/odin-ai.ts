import "server-only";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { ConsumeResult, GenerationStatus } from "@/lib/generations";

export const ODIN_AI_MONTHLY_LIMIT = 100;
export type OdinAiUser = {
  id: string;
  email: string;
  name: string;
  source: "odin-bearer";
  treatAsSubscribed: false;
  cepClient: "odin-cep";
  odinSubscriptionActive: boolean;
  odinSubscriptionExpiresAt: string | null;
};

/** Only the Odin account service can attest identity and subscription. */
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
  return {
    id: `odin:${id}`, email: profile.user.email,
    name: typeof profile.user.name === "string" ? profile.user.name : "",
    source: "odin-bearer", treatAsSubscribed: false, cepClient: "odin-cep",
    odinSubscriptionActive: profile.subscription?.active === true,
    odinSubscriptionExpiresAt: typeof profile.subscription?.renews_at === "string"
      ? profile.subscription.renews_at : null,
  };
}

function subscribed(user: OdinAiUser): boolean {
  return user.odinSubscriptionActive && (!user.odinSubscriptionExpiresAt ||
    Date.parse(user.odinSubscriptionExpiresAt) > Date.now());
}

function statusFor(user: OdinAiUser, used: number): GenerationStatus {
  const active = subscribed(user);
  const limit = active ? ODIN_AI_MONTHLY_LIMIT : 0;
  const remaining = Math.max(0, limit - used);
  return { used, limit, effective_limit: limit, remaining, hasSubscription: active,
    plan: active ? "odin" : "none", subscription_generations_left: remaining,
    extra_generations_left: 0, total_generations_left: remaining };
}

/** Separate identities: Odin UUIDs never become Motionflow numeric user ids. */
const SCHEMA = `CREATE TABLE IF NOT EXISTS odin_ai_generations (
  user_id VARCHAR(133) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  month_key CHAR(7) NOT NULL,
  used INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, month_key)
) ENGINE=InnoDB`;
let schemaReady: Promise<void> | undefined;
async function ensureSchema() {
  if (!schemaReady) schemaReady = getPool().query(SCHEMA).then(() => undefined).catch(error => {
    schemaReady = undefined;
    throw error;
  });
  await schemaReady;
}
const monthKey = () => new Date().toISOString().slice(0, 7);
type UsageRow = RowDataPacket & { used: number };

export async function odinAiStatus(user: OdinAiUser): Promise<GenerationStatus> {
  if (!subscribed(user)) return statusFor(user, 0);
  await ensureSchema();
  const [rows] = await getPool().execute<UsageRow[]>(
    "SELECT used FROM odin_ai_generations WHERE user_id = ? AND month_key = ?",
    [user.id, monthKey()],
  );
  return statusFor(user, Number(rows[0]?.used ?? 0));
}

/** The conditional update enforces one quota across simultaneous devices/tools. */
export async function consumeOdinAi(user: OdinAiUser, amount: number): Promise<ConsumeResult> {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid generation cost");
  if (!subscribed(user)) return { ok: false, reason: "limit_reached", status: statusFor(user, 0) };
  if (amount === 0) return { ok: true, status: await odinAiStatus(user) };
  await ensureSchema();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const month = monthKey();
    await conn.execute("INSERT IGNORE INTO odin_ai_generations (user_id, month_key) VALUES (?, ?)", [user.id, month]);
    const [result] = await conn.execute<ResultSetHeader>(
      "UPDATE odin_ai_generations SET used = used + ? WHERE user_id = ? AND month_key = ? AND used + ? <= ?",
      [amount, user.id, month, amount, ODIN_AI_MONTHLY_LIMIT],
    );
    const [rows] = await conn.execute<UsageRow[]>(
      "SELECT used FROM odin_ai_generations WHERE user_id = ? AND month_key = ?", [user.id, month],
    );
    const status = statusFor(user, Number(rows[0].used));
    await conn.commit();
    return result.affectedRows === 1 ? { ok: true, status } : { ok: false, reason: "limit_reached", status };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}
