import "server-only";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import {
  getMotionflowGenerationContext,
  type MotionflowGenerationContext,
  type MotionflowGenerationPlan,
} from "@/lib/subscriptions";

/** Lifetime cap for users without an active Motionflow Creator subscription. */
export const FREE_GENERATIONS_LIMIT = 5;
/** Generations per Paddle billing period for Motionflow Creator (no AI bundle). */
export const CREATOR_BILLING_PERIOD_GENERATIONS_LIMIT = 5;
/** Generations per Paddle billing period for Motionflow Creator + AI. */
export const CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT = 100;

export const GENERATION_TOOLS = [
  "image",
  "image_edit",
  "image_remove_bg",
  "image_upscale",
  "video",
  "tts",
  "stt",
] as const;
export type GenerationTool = (typeof GENERATION_TOOLS)[number];

export interface GenerationStatus {
  used: number;
  limit: number;
  /** Subscription generations remaining this billing period (backward compat). */
  remaining: number;
  /** True when the user has Creator or Creator + AI (paid monthly quota). */
  hasSubscription: boolean;
  /** Plan that sets the limit and whether usage is monthly or lifetime. */
  plan: MotionflowGenerationPlan;
  /** Generations remaining from the monthly subscription quota. */
  subscription_generations_left: number;
  /** Purchased extra generations (never expire). */
  extra_generations_left: number;
  /** Total generations available = subscription_generations_left + extra_generations_left. */
  total_generations_left: number;
}

const TABLE = "user_generations";

let tableEnsured = false;

/** Lazily create the tracking table on first use. Safe to call repeatedly. */
async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       user_id BIGINT UNSIGNED NOT NULL,
       tool VARCHAR(32) NOT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       KEY idx_user (user_id),
       KEY idx_user_created (user_id, created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  tableEnsured = true;
}

function isValidTool(value: unknown): value is GenerationTool {
  return (
    typeof value === "string" &&
    (GENERATION_TOOLS as readonly string[]).includes(value)
  );
}

export function parseTool(value: unknown): GenerationTool | null {
  return isValidTool(value) ? value : null;
}

/** Fallback when `subscription_systems.paddle_billing_period_*` is not filled yet. */
function utcMonthBounds(): { start: string; endExclusive: string } {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0));
  const fmt = (x: Date) => x.toISOString().slice(0, 19).replace("T", " ");
  return { start: fmt(start), endExclusive: fmt(endExclusive) };
}

function resolveUsageWindow(
  ctx: MotionflowGenerationContext,
): { start: string; endExclusive: string } {
  const start = ctx.paddleBillingPeriodStartsAt;
  const end = ctx.paddleBillingPeriodEndsAt;
  if (start && end) {
    return { start, endExclusive: end };
  }
  return utcMonthBounds();
}

function getLimitForPlan(plan: MotionflowGenerationPlan): {
  limit: number;
  hasSubscription: boolean;
} {
  switch (plan) {
    case "creator_ai":
      return {
        hasSubscription: true,
        limit: CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT,
      };
    case "creator":
      return {
        hasSubscription: true,
        limit: CREATOR_BILLING_PERIOD_GENERATIONS_LIMIT,
      };
    default:
      return { hasSubscription: false, limit: FREE_GENERATIONS_LIMIT };
  }
}

async function countUsed(
  userId: number,
  plan: MotionflowGenerationPlan,
  usageWindow: { start: string; endExclusive: string },
  conn?: PoolConnection,
): Promise<number> {
  type CountRow = RowDataPacket & { c: number };
  const executor = conn ?? getPool();
  if (plan === "none") {
    const lock = conn ? " FOR UPDATE" : "";
    const [rows] = await executor.execute<CountRow[]>(
      `SELECT COUNT(*) AS c FROM \`${TABLE}\` WHERE user_id = ?${lock}`,
      [userId],
    );
    return Number(rows[0]?.c ?? 0);
  }
  const { start, endExclusive } = usageWindow;
  const lock = conn ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<CountRow[]>(
    `SELECT COUNT(*) AS c FROM \`${TABLE}\`
     WHERE user_id = ?
       AND created_at >= ?
       AND created_at < ?${lock}`,
    [userId, start, endExclusive],
  );
  return Number(rows[0]?.c ?? 0);
}

async function getExtraGenerationsCount(
  userId: number,
  conn?: PoolConnection,
): Promise<number> {
  type ExtraRow = RowDataPacket & { extra_generations_count: number };
  const executor = conn ?? getPool();
  const lock = conn ? " FOR UPDATE" : "";
  const [rows] = await executor.execute<ExtraRow[]>(
    `SELECT extra_generations_count FROM users WHERE id = ?${lock}`,
    [userId],
  );
  return Number(rows[0]?.extra_generations_count ?? 0);
}

export async function getGenerationsStatus(
  userId: number,
): Promise<GenerationStatus> {
  await ensureTable();
  const ctx = await getMotionflowGenerationContext(userId);
  const plan = ctx.plan;
  const { limit, hasSubscription } = getLimitForPlan(plan);
  const usageWindow = resolveUsageWindow(ctx);
  const used = await countUsed(userId, plan, usageWindow);
  const subscription_generations_left = Math.max(0, limit - used);
  const extra_generations_left =
    plan === "creator_ai" ? await getExtraGenerationsCount(userId) : 0;
  const total_generations_left =
    subscription_generations_left + extra_generations_left;
  return {
    used,
    limit,
    remaining: subscription_generations_left,
    hasSubscription,
    plan,
    subscription_generations_left,
    extra_generations_left,
    total_generations_left,
  };
}

export type ConsumeResult =
  | { ok: true; status: GenerationStatus }
  | { ok: false; status: GenerationStatus; reason: "limit_reached" };

/**
 * Atomically reserves one generation for the user.
 * Re-checks the limit inside a transaction to avoid race conditions.
 * Creator + AI: deducts subscription quota first, then extra_generations_count.
 */
export async function consumeGeneration(
  userId: number,
  tool: GenerationTool,
): Promise<ConsumeResult> {
  await ensureTable();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const ctx = await getMotionflowGenerationContext(userId);
    const plan = ctx.plan;
    const { limit, hasSubscription } = getLimitForPlan(plan);
    const usageWindow = resolveUsageWindow(ctx);
    const used = await countUsed(userId, plan, usageWindow, conn);
    const extraCount =
      plan === "creator_ai" ? await getExtraGenerationsCount(userId, conn) : 0;

    const subscriptionLeft = Math.max(0, limit - used);
    const totalLeft = subscriptionLeft + extraCount;

    if (totalLeft <= 0) {
      await conn.rollback();
      return {
        ok: false,
        reason: "limit_reached",
        status: {
          used,
          limit,
          remaining: 0,
          hasSubscription,
          plan,
          subscription_generations_left: 0,
          extra_generations_left: 0,
          total_generations_left: 0,
        },
      };
    }

    let newSubscriptionLeft: number;
    let newExtraLeft: number;

    if (subscriptionLeft > 0) {
      await conn.execute<ResultSetHeader>(
        `INSERT INTO \`${TABLE}\` (user_id, tool) VALUES (?, ?)`,
        [userId, tool],
      );
      newSubscriptionLeft = subscriptionLeft - 1;
      newExtraLeft = extraCount;
    } else {
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE users
            SET extra_generations_count = extra_generations_count - 1
          WHERE id = ? AND extra_generations_count > 0`,
        [userId],
      );
      if (result.affectedRows === 0) {
        await conn.rollback();
        return {
          ok: false,
          reason: "limit_reached",
          status: {
            used,
            limit,
            remaining: 0,
            hasSubscription,
            plan,
            subscription_generations_left: 0,
            extra_generations_left: 0,
            total_generations_left: 0,
          },
        };
      }
      newSubscriptionLeft = 0;
      newExtraLeft = extraCount - 1;
    }

    await conn.commit();

    const newUsed = subscriptionLeft > 0 ? used + 1 : used;
    const newTotal = newSubscriptionLeft + newExtraLeft;
    return {
      ok: true,
      status: {
        used: newUsed,
        limit,
        remaining: newSubscriptionLeft,
        hasSubscription,
        plan,
        subscription_generations_left: newSubscriptionLeft,
        extra_generations_left: newExtraLeft,
        total_generations_left: newTotal,
      },
    };
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    conn.release();
  }
}
