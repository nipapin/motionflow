import "server-only";

import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

const CREDITS_TABLE = "user_generation_credits";
const AUDIT_TABLE = "user_generation_credit_audit";

let schemaEnsured = false;

export async function ensureUserGenerationCreditsSchema(): Promise<void> {
    if (schemaEnsured) return;
    const pool = getPool();
    await pool.query(
        `CREATE TABLE IF NOT EXISTS \`${CREDITS_TABLE}\` (
       \`user_id\` BIGINT UNSIGNED NOT NULL,
       \`extra_balance\` INT NOT NULL DEFAULT 0,
       \`subscription_adjustment\` INT NOT NULL DEFAULT 0,
       \`subscription_adjustment_period_start\` DATETIME NULL,
       \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (\`user_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await pool.query(
        `CREATE TABLE IF NOT EXISTS \`${AUDIT_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`user_id\` BIGINT UNSIGNED NOT NULL,
       \`action\` VARCHAR(64) NOT NULL,
       \`payload\` JSON NULL,
       \`note\` TEXT NULL,
       \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       KEY \`idx_user_created\` (\`user_id\`, \`created_at\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    schemaEnsured = true;
}

export type CreditsRow = RowDataPacket & {
    extra_balance: number;
    subscription_adjustment: number;
};

/** Raw SSOT value from `user_generation_credits.subscription_adjustment` (no period checks). */
export function subscriptionAdjustmentFromRow(
    row: Pick<CreditsRow, "subscription_adjustment"> | null | undefined,
): number {
    if (!row) return 0;
    const adj = Number(row.subscription_adjustment ?? 0);
    if (!Number.isFinite(adj)) return 0;
    return Math.trunc(adj);
}

export async function getSubscriptionAdjustment(
    userId: number,
    conn?: PoolConnection,
): Promise<number> {
    await ensureUserGenerationCreditsSchema();
    const exec = conn ?? getPool();
    const [rows] = await exec.execute<CreditsRow[]>(
        `SELECT subscription_adjustment FROM \`${CREDITS_TABLE}\` WHERE user_id = ?`,
        [userId],
    );
    return subscriptionAdjustmentFromRow(rows[0] ?? null);
}

/**
 * Ensure a credits row exists; copies `users.extra_generations_count` on first insert.
 */
export async function ensureCreditsRowForUser(
    userId: number,
    conn: PoolConnection,
): Promise<void> {
    await ensureUserGenerationCreditsSchema();
    await conn.execute(
        `INSERT INTO \`${CREDITS_TABLE}\` (user_id, extra_balance)
         SELECT ?, IFNULL(u.extra_generations_count, 0) FROM users u WHERE u.id = ?
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [userId, userId],
    );
}

/**
 * Extra generations available (Creator + AI). Reads SSOT table; falls back to `users` if no row.
 */
export async function getExtraBalance(
    userId: number,
    conn?: PoolConnection,
): Promise<number> {
    await ensureUserGenerationCreditsSchema();
    const exec = conn ?? getPool();
    const [rows] = await exec.execute<CreditsRow[]>(
        `SELECT extra_balance FROM \`${CREDITS_TABLE}\` WHERE user_id = ?`,
        [userId],
    );
    if (rows[0]) return Number(rows[0].extra_balance ?? 0);
    type URow = RowDataPacket & { extra_generations_count: number };
    const [urows] = await exec.execute<URow[]>(
        `SELECT extra_generations_count FROM users WHERE id = ?`,
        [userId],
    );
    return Number(urows[0]?.extra_generations_count ?? 0);
}

export async function fetchCreditsRowLocked(
    userId: number,
    conn: PoolConnection,
): Promise<CreditsRow | null> {
    const [rows] = await conn.execute<CreditsRow[]>(
        `SELECT extra_balance, subscription_adjustment
       FROM \`${CREDITS_TABLE}\`
      WHERE user_id = ?
      FOR UPDATE`,
        [userId],
    );
    return rows[0] ?? null;
}

/** Paddle pack purchase (+N on both SSOT and legacy `users` column). */
export async function incrementPurchasedExtraBalance(
    userId: number,
    delta: number,
    conn: PoolConnection,
): Promise<void> {
    if (delta <= 0) return;
    await ensureCreditsRowForUser(userId, conn);
    await conn.execute(
        `UPDATE users SET extra_generations_count = extra_generations_count + ? WHERE id = ?`,
        [delta, userId],
    );
    await conn.execute(
        `UPDATE \`${CREDITS_TABLE}\` SET extra_balance = extra_balance + ? WHERE user_id = ?`,
        [delta, userId],
    );
}

export async function recordCreditAudit(
    userId: number,
    action: string,
    payload: Record<string, unknown>,
    note?: string | null,
): Promise<void> {
    await ensureUserGenerationCreditsSchema();
    await getPool().execute(
        `INSERT INTO \`${AUDIT_TABLE}\` (user_id, action, payload, note) VALUES (?, ?, ?, ?)`,
        [
            userId,
            action,
            JSON.stringify(payload),
            note ?? null,
        ],
    );
}

export interface AdminCreditUpdateInput {
    userId: number;
    /** Set absolute extra balance (SSOT + mirrored on `users`). */
    setExtraBalance?: number;
    /** Absolute bonus added to plan limit (`plan_limit + subscription_adjustment`). */
    subscriptionAdjustment?: number;
    note?: string | null;
}

export async function adminApplyCreditChanges(
    input: AdminCreditUpdateInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
    await ensureUserGenerationCreditsSchema();
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await ensureCreditsRowForUser(input.userId, conn);

        if (input.setExtraBalance !== undefined) {
            const n = Math.floor(Number(input.setExtraBalance));
            if (!Number.isFinite(n) || n < 0) {
                await conn.rollback();
                return { ok: false, error: "setExtraBalance must be a non-negative integer" };
            }
            await conn.execute(
                `UPDATE \`${CREDITS_TABLE}\` SET extra_balance = ? WHERE user_id = ?`,
                [n, input.userId],
            );
            await conn.execute(
                `UPDATE users SET extra_generations_count = ? WHERE id = ?`,
                [n, input.userId],
            );
        }

        if (input.subscriptionAdjustment !== undefined) {
            const adj = Math.floor(Number(input.subscriptionAdjustment));
            if (!Number.isFinite(adj) || adj < 0) {
                await conn.rollback();
                return { ok: false, error: "subscriptionAdjustment must be a non-negative integer" };
            }
            await conn.execute(
                `UPDATE \`${CREDITS_TABLE}\`
                    SET subscription_adjustment = ?,
                        subscription_adjustment_period_start = NULL
                  WHERE user_id = ?`,
                [adj, input.userId],
            );
        }

        await conn.commit();

        const auditPayload: Record<string, unknown> = {};
        if (input.setExtraBalance !== undefined) {
            auditPayload.setExtraBalance = input.setExtraBalance;
        }
        if (input.subscriptionAdjustment !== undefined) {
            auditPayload.subscriptionAdjustment = input.subscriptionAdjustment;
        }
        await recordCreditAudit(
            input.userId,
            "admin_update",
            auditPayload,
            input.note ?? null,
        );

        return { ok: true };
    } catch (err) {
        try {
            await conn.rollback();
        } catch {
            /* ignore */
        }
        console.error("[user_generation_credits] adminApplyCreditChanges failed:", err);
        return { ok: false, error: "database_error" };
    } finally {
        conn.release();
    }
}

/**
 * Decrement extra in SSOT + mirror on `users`. Caller must hold transaction + ensure row.
 */
export async function decrementExtraBalanceOne(
    userId: number,
    conn: PoolConnection,
): Promise<boolean> {
    const [u1] = await conn.execute<ResultSetHeader>(
        `UPDATE \`${CREDITS_TABLE}\`
            SET extra_balance = extra_balance - 1
          WHERE user_id = ? AND extra_balance > 0`,
        [userId],
    );
    if (u1.affectedRows === 0) return false;
    const [u2] = await conn.execute<ResultSetHeader>(
        `UPDATE users
            SET extra_generations_count = extra_generations_count - 1
          WHERE id = ? AND extra_generations_count > 0`,
        [userId],
    );
    if (u2.affectedRows === 0) {
        await conn.execute(
            `UPDATE \`${CREDITS_TABLE}\` SET extra_balance = extra_balance + 1 WHERE user_id = ?`,
            [userId],
        );
        return false;
    }
    return true;
}
