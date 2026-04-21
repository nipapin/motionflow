import "server-only";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import type { MotionflowGenerationPlan } from "@/lib/generation-plan";
import {
  getMotionflowGenerationContext,
  type MotionflowGenerationContext,
} from "@/lib/subscriptions";

/** Lifetime cap for users without an active Motionflow Creator subscription. */
export const FREE_GENERATIONS_LIMIT = 5;
/** Generations per Paddle billing period for Motionflow Creator. */
export const CREATOR_BILLING_PERIOD_GENERATIONS_LIMIT = 10;
/** Generations per Paddle billing period for Motionflow Creator + AI. */
export const CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT = 100;

export const GENERATION_TOOLS = ["image", "video", "tts", "stt"] as const;
export type GenerationTool = (typeof GENERATION_TOOLS)[number];

export interface GenerationStatus {
  used: number;
  limit: number;
  remaining: number;
  /** True when the user has Creator or Creator + AI (paid monthly quota). */
  hasSubscription: boolean;
  /** Plan that sets the limit and whether usage is monthly or lifetime. */
  plan: MotionflowGenerationPlan;
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

export async function getGenerationsStatus(
  userId: number,
): Promise<GenerationStatus> {
  await ensureTable();
  const ctx = await getMotionflowGenerationContext(userId);
  const plan = ctx.plan;
  const { limit, hasSubscription } = getLimitForPlan(plan);
  const usageWindow = resolveUsageWindow(ctx);
  const used = await countUsed(userId, plan, usageWindow);
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, hasSubscription, plan };
}

export type ConsumeResult =
  | { ok: true; status: GenerationStatus }
  | { ok: false; status: GenerationStatus; reason: "limit_reached" };

/**
 * Atomically reserves one generation for the user.
 * Re-checks the limit inside a transaction to avoid race conditions.
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

    if (used >= limit) {
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
        },
      };
    }

    await conn.execute<ResultSetHeader>(
      `INSERT INTO \`${TABLE}\` (user_id, tool) VALUES (?, ?)`,
      [userId, tool],
    );

    await conn.commit();

    const newUsed = used + 1;
    return {
      ok: true,
      status: {
        used: newUsed,
        limit,
        remaining: Math.max(0, limit - newUsed),
        hasSubscription,
        plan,
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
