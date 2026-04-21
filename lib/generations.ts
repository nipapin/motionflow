import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

/** Lifetime generation cap for users without an active AI subscription. */
export const FREE_GENERATIONS_LIMIT = 5;
/** Lifetime generation cap for users with an active AI subscription (Creator + AI plan). */
export const PRO_GENERATIONS_LIMIT = 100;

/**
 * Returns whether the user holds an active **AI** subscription (Creator + AI plan).
 *
 * The plain Motionflow ("Creator") subscription unlocks the marketplace catalog
 * but does NOT include AI tools — only the Creator + AI plan does.
 *
 * TODO: wire this up to the real AI subscription source once the product exists in
 * `subscription_systems` (or wherever AI plans are stored). For now nobody is
 * recognised as an AI subscriber, so every user is on the free tier (5 generations).
 */
export async function hasActiveAiSubscription(
  _userId: number,
): Promise<boolean> {
  return false;
}

export const GENERATION_TOOLS = ["image", "video", "tts", "stt"] as const;
export type GenerationTool = (typeof GENERATION_TOOLS)[number];

export interface GenerationStatus {
  used: number;
  limit: number;
  remaining: number;
  hasSubscription: boolean;
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

async function getLimit(userId: number): Promise<{ limit: number; hasSubscription: boolean }> {
  const hasSubscription = await hasActiveAiSubscription(userId);
  return {
    hasSubscription,
    limit: hasSubscription ? PRO_GENERATIONS_LIMIT : FREE_GENERATIONS_LIMIT,
  };
}

async function countUsed(userId: number): Promise<number> {
  const pool = getPool();
  type CountRow = RowDataPacket & { c: number };
  const [rows] = await pool.execute<CountRow[]>(
    `SELECT COUNT(*) AS c FROM \`${TABLE}\` WHERE user_id = ?`,
    [userId],
  );
  return Number(rows[0]?.c ?? 0);
}

export async function getGenerationsStatus(
  userId: number,
): Promise<GenerationStatus> {
  await ensureTable();
  const [{ limit, hasSubscription }, used] = await Promise.all([
    getLimit(userId),
    countUsed(userId),
  ]);
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, hasSubscription };
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

    const { limit, hasSubscription } = await getLimit(userId);

    type CountRow = RowDataPacket & { c: number };
    const [countRows] = await conn.execute<CountRow[]>(
      `SELECT COUNT(*) AS c FROM \`${TABLE}\` WHERE user_id = ? FOR UPDATE`,
      [userId],
    );
    const used = Number(countRows[0]?.c ?? 0);

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
