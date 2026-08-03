import "server-only";

import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

const CREDITS_TABLE = "user_generation_credits";
const AUDIT_TABLE = "user_generation_credit_audit";

/** Platform (Motionflow web) credit scope — not tied to a marketplace author. */
export const MOTIONFLOW_CREDITS_AUTHOR_ID = 0;

let schemaEnsured = false;

type ColRow = RowDataPacket & { c: number };

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await getPool().execute<ColRow[]>(
    `SELECT COUNT(*) AS c
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?`,
    [table, column],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const [rows] = await getPool().execute<ColRow[]>(
    `SELECT COUNT(*) AS c
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?`,
    [table, indexName],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/**
 * Idempotent schema: PK (user_id, author_id). Existing rows → author_id = 0 (Motionflow).
 */
export async function ensureUserGenerationCreditsSchema(): Promise<void> {
  if (schemaEnsured) return;
  const pool = getPool();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${CREDITS_TABLE}\` (
       \`user_id\` BIGINT UNSIGNED NOT NULL,
       \`author_id\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
       \`extra_balance\` INT NOT NULL DEFAULT 0,
       \`subscription_adjustment\` INT NOT NULL DEFAULT 0,
       \`subscription_adjustment_period_start\` DATETIME NULL,
       \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (\`user_id\`, \`author_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  // Legacy table created without author_id — migrate in place.
  if (!(await columnExists(CREDITS_TABLE, "author_id"))) {
    await pool.query(
      `ALTER TABLE \`${CREDITS_TABLE}\`
         ADD COLUMN \`author_id\` BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER \`user_id\``,
    );
    await pool.query(
      `UPDATE \`${CREDITS_TABLE}\` SET \`author_id\` = ${MOTIONFLOW_CREDITS_AUTHOR_ID}`,
    );
    // Drop old single-column PK if present, then add composite PK.
    try {
      await pool.query(`ALTER TABLE \`${CREDITS_TABLE}\` DROP PRIMARY KEY`);
    } catch {
      /* already composite or no PK */
    }
    try {
      await pool.query(
        `ALTER TABLE \`${CREDITS_TABLE}\` ADD PRIMARY KEY (\`user_id\`, \`author_id\`)`,
      );
    } catch {
      /* already has composite PK */
    }
  }

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${AUDIT_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`user_id\` BIGINT UNSIGNED NOT NULL,
       \`author_id\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
       \`action\` VARCHAR(64) NOT NULL,
       \`payload\` JSON NULL,
       \`note\` TEXT NULL,
       \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       KEY \`idx_user_created\` (\`user_id\`, \`created_at\`),
       KEY \`idx_user_author_created\` (\`user_id\`, \`author_id\`, \`created_at\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  if (!(await columnExists(AUDIT_TABLE, "author_id"))) {
    await pool.query(
      `ALTER TABLE \`${AUDIT_TABLE}\`
         ADD COLUMN \`author_id\` BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER \`user_id\``,
    );
    await pool.query(
      `UPDATE \`${AUDIT_TABLE}\` SET \`author_id\` = ${MOTIONFLOW_CREDITS_AUTHOR_ID}`,
    );
  }
  if (!(await indexExists(AUDIT_TABLE, "idx_user_author_created"))) {
    try {
      await pool.query(
        `ALTER TABLE \`${AUDIT_TABLE}\`
           ADD KEY \`idx_user_author_created\` (\`user_id\`, \`author_id\`, \`created_at\`)`,
      );
    } catch {
      /* ignore */
    }
  }

  await seedSpunkramExtraUser6Once();

  schemaEnsured = true;
}

/**
 * One-shot: user 6 gets 100 Spunkram (author 1691) extra credits for CEP testing.
 * Skips if the row already exists or an audit marker is present.
 */
async function seedSpunkramExtraUser6Once(): Promise<void> {
  const pool = getPool();
  const userId = 6;
  const authorId = SPUNKRAM_AUTHOR_ID;
  const amount = 100;

  type AuditRow = RowDataPacket & { c: number };
  const [markers] = await pool.execute<AuditRow[]>(
    `SELECT COUNT(*) AS c FROM \`${AUDIT_TABLE}\`
      WHERE user_id = ? AND author_id = ? AND action = ?`,
    [userId, authorId, "seed_spunkram_extra"],
  );
  if (Number(markers[0]?.c ?? 0) > 0) return;

  type ExistRow = RowDataPacket & { c: number };
  const [existing] = await pool.execute<ExistRow[]>(
    `SELECT COUNT(*) AS c FROM \`${CREDITS_TABLE}\`
      WHERE user_id = ? AND author_id = ?`,
    [userId, authorId],
  );
  if (Number(existing[0]?.c ?? 0) > 0) {
    // Row already there (manual/admin) — still mark seed so we don't retry.
    await pool.execute(
      `INSERT INTO \`${AUDIT_TABLE}\` (user_id, author_id, action, payload, note)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        authorId,
        "seed_spunkram_extra",
        JSON.stringify({ skipped: true, reason: "row_exists" }),
        "seed skipped — Spunkram credits row already present",
      ],
    );
    return;
  }

  await pool.execute(
    `INSERT INTO \`${CREDITS_TABLE}\` (user_id, author_id, extra_balance)
     VALUES (?, ?, ?)`,
    [userId, authorId, amount],
  );
  await pool.execute(
    `INSERT INTO \`${AUDIT_TABLE}\` (user_id, author_id, action, payload, note)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userId,
      authorId,
      "seed_spunkram_extra",
      JSON.stringify({ extra_balance: amount }),
      "Idempotent seed: 100 Spunkram CEP extra generations",
    ],
  );
}

export type CreditsRow = RowDataPacket & {
  extra_balance: number;
  subscription_adjustment: number;
  author_id?: number;
};

function normalizeAuthorId(authorId: number | undefined | null): number {
  const n = Number(authorId);
  if (!Number.isFinite(n) || n < 0) return MOTIONFLOW_CREDITS_AUTHOR_ID;
  return Math.trunc(n);
}

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
  authorId: number = MOTIONFLOW_CREDITS_AUTHOR_ID,
  conn?: PoolConnection,
): Promise<number> {
  await ensureUserGenerationCreditsSchema();
  const scope = normalizeAuthorId(authorId);
  const exec = conn ?? getPool();
  const [rows] = await exec.execute<CreditsRow[]>(
    `SELECT subscription_adjustment FROM \`${CREDITS_TABLE}\`
      WHERE user_id = ? AND author_id = ?`,
    [userId, scope],
  );
  return subscriptionAdjustmentFromRow(rows[0] ?? null);
}

/**
 * Ensure a credits row exists for (user, author).
 * Motionflow (author_id=0): seed extra from `users.extra_generations_count`.
 * Author scopes: start at 0.
 */
export async function ensureCreditsRowForUser(
  userId: number,
  authorId: number,
  conn: PoolConnection,
): Promise<void> {
  await ensureUserGenerationCreditsSchema();
  const scope = normalizeAuthorId(authorId);
  if (scope === MOTIONFLOW_CREDITS_AUTHOR_ID) {
    await conn.execute(
      `INSERT INTO \`${CREDITS_TABLE}\` (user_id, author_id, extra_balance)
       SELECT ?, ?, IFNULL(u.extra_generations_count, 0) FROM users u WHERE u.id = ?
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [userId, scope, userId],
    );
    return;
  }
  await conn.execute(
    `INSERT INTO \`${CREDITS_TABLE}\` (user_id, author_id, extra_balance)
     VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
    [userId, scope],
  );
}

/**
 * Extra generations for a credit scope.
 * Motionflow falls back to `users.extra_generations_count` when no SSOT row.
 */
export async function getExtraBalance(
  userId: number,
  authorId: number = MOTIONFLOW_CREDITS_AUTHOR_ID,
  conn?: PoolConnection,
): Promise<number> {
  await ensureUserGenerationCreditsSchema();
  const scope = normalizeAuthorId(authorId);
  const exec = conn ?? getPool();
  const [rows] = await exec.execute<CreditsRow[]>(
    `SELECT extra_balance FROM \`${CREDITS_TABLE}\`
      WHERE user_id = ? AND author_id = ?`,
    [userId, scope],
  );
  if (rows[0]) return Number(rows[0].extra_balance ?? 0);
  if (scope !== MOTIONFLOW_CREDITS_AUTHOR_ID) return 0;
  type URow = RowDataPacket & { extra_generations_count: number };
  const [urows] = await exec.execute<URow[]>(
    `SELECT extra_generations_count FROM users WHERE id = ?`,
    [userId],
  );
  return Number(urows[0]?.extra_generations_count ?? 0);
}

export async function fetchCreditsRowLocked(
  userId: number,
  authorId: number,
  conn: PoolConnection,
): Promise<CreditsRow | null> {
  const scope = normalizeAuthorId(authorId);
  const [rows] = await conn.execute<CreditsRow[]>(
    `SELECT extra_balance, subscription_adjustment, author_id
       FROM \`${CREDITS_TABLE}\`
      WHERE user_id = ? AND author_id = ?
      FOR UPDATE`,
    [userId, scope],
  );
  return rows[0] ?? null;
}

/**
 * Paddle / purchase +N on SSOT. Mirrors `users.extra_generations_count` only for Motionflow.
 */
export async function incrementPurchasedExtraBalance(
  userId: number,
  delta: number,
  conn: PoolConnection,
  authorId: number = MOTIONFLOW_CREDITS_AUTHOR_ID,
): Promise<void> {
  if (delta <= 0) return;
  const scope = normalizeAuthorId(authorId);
  await ensureCreditsRowForUser(userId, scope, conn);
  if (scope === MOTIONFLOW_CREDITS_AUTHOR_ID) {
    await conn.execute(
      `UPDATE users SET extra_generations_count = extra_generations_count + ? WHERE id = ?`,
      [delta, userId],
    );
  }
  await conn.execute(
    `UPDATE \`${CREDITS_TABLE}\`
        SET extra_balance = extra_balance + ?
      WHERE user_id = ? AND author_id = ?`,
    [delta, userId, scope],
  );
}

export async function recordCreditAudit(
  userId: number,
  action: string,
  payload: Record<string, unknown>,
  note?: string | null,
  authorId: number = MOTIONFLOW_CREDITS_AUTHOR_ID,
): Promise<void> {
  await ensureUserGenerationCreditsSchema();
  const scope = normalizeAuthorId(authorId);
  await getPool().execute(
    `INSERT INTO \`${AUDIT_TABLE}\` (user_id, author_id, action, payload, note)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, scope, action, JSON.stringify(payload), note ?? null],
  );
}

export interface AdminCreditUpdateInput {
  userId: number;
  /** Credit scope; default Motionflow (0). */
  authorId?: number;
  /** Set absolute extra balance (SSOT; mirrors `users` only when authorId=0). */
  setExtraBalance?: number;
  /** Absolute bonus added to plan limit (`plan_limit + subscription_adjustment`). */
  subscriptionAdjustment?: number;
  note?: string | null;
}

export async function adminApplyCreditChanges(
  input: AdminCreditUpdateInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureUserGenerationCreditsSchema();
  const authorId = normalizeAuthorId(input.authorId);
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await ensureCreditsRowForUser(input.userId, authorId, conn);

    if (input.setExtraBalance !== undefined) {
      const n = Math.floor(Number(input.setExtraBalance));
      if (!Number.isFinite(n) || n < 0) {
        await conn.rollback();
        return { ok: false, error: "setExtraBalance must be a non-negative integer" };
      }
      await conn.execute(
        `UPDATE \`${CREDITS_TABLE}\` SET extra_balance = ?
          WHERE user_id = ? AND author_id = ?`,
        [n, input.userId, authorId],
      );
      if (authorId === MOTIONFLOW_CREDITS_AUTHOR_ID) {
        await conn.execute(
          `UPDATE users SET extra_generations_count = ? WHERE id = ?`,
          [n, input.userId],
        );
      }
    }

    if (input.subscriptionAdjustment !== undefined) {
      const adj = Math.floor(Number(input.subscriptionAdjustment));
      if (!Number.isFinite(adj) || adj < 0) {
        await conn.rollback();
        return {
          ok: false,
          error: "subscriptionAdjustment must be a non-negative integer",
        };
      }
      await conn.execute(
        `UPDATE \`${CREDITS_TABLE}\`
            SET subscription_adjustment = ?,
                subscription_adjustment_period_start = NULL
          WHERE user_id = ? AND author_id = ?`,
        [adj, input.userId, authorId],
      );
    }

    await conn.commit();

    const auditPayload: Record<string, unknown> = { authorId };
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
      authorId,
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
 * Decrement extra in SSOT. Mirrors `users` only for Motionflow scope.
 * Caller must hold transaction + ensure row.
 */
export async function decrementExtraBalanceOne(
  userId: number,
  conn: PoolConnection,
  authorId: number = MOTIONFLOW_CREDITS_AUTHOR_ID,
): Promise<boolean> {
  const scope = normalizeAuthorId(authorId);
  const [u1] = await conn.execute<ResultSetHeader>(
    `UPDATE \`${CREDITS_TABLE}\`
        SET extra_balance = extra_balance - 1
      WHERE user_id = ? AND author_id = ? AND extra_balance > 0`,
    [userId, scope],
  );
  if (u1.affectedRows === 0) return false;

  if (scope !== MOTIONFLOW_CREDITS_AUTHOR_ID) return true;

  const [u2] = await conn.execute<ResultSetHeader>(
    `UPDATE users
        SET extra_generations_count = extra_generations_count - 1
      WHERE id = ? AND extra_generations_count > 0`,
    [userId],
  );
  if (u2.affectedRows === 0) {
    await conn.execute(
      `UPDATE \`${CREDITS_TABLE}\`
          SET extra_balance = extra_balance + 1
        WHERE user_id = ? AND author_id = ?`,
      [userId, scope],
    );
    return false;
  }
  return true;
}
