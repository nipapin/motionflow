import "server-only";

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { normalizeAffiliateSlug } from "@/lib/affiliate/shared";
import type {
  Affiliate,
  AffiliateCommission,
  AffiliateCommissionStatus,
  AffiliateCreateInput,
  AffiliateRecurringMode,
  AffiliateStatus,
  AffiliateUpdateInput,
} from "@/lib/affiliate/types";

export const AFFILIATES_TABLE = "affiliates";
export const AFFILIATE_COMMISSIONS_TABLE = "affiliate_commissions";
export const AFFILIATE_PAYOUTS_TABLE = "affiliate_payouts";
export const AFFILIATE_LINK_HITS_TABLE = "affiliate_link_hits";

let schemaEnsured = false;

type CountRow = RowDataPacket & { c: number };

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await getPool().execute<CountRow[]>(
    `SELECT COUNT(*) AS c
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?`,
    [table, column],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/**
 * Lazily create the affiliate schema — mirrors `db/migrations/2026_09_13_affiliates.sql`
 * so a fresh deploy works without running the migration by hand.
 */
export async function ensureAffiliateSchema(): Promise<void> {
  if (schemaEnsured) return;
  const pool = getPool();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${AFFILIATES_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`user_id\` BIGINT UNSIGNED NULL,
       \`email\` VARCHAR(255) NOT NULL,
       \`name\` VARCHAR(191) NOT NULL,
       \`social_url\` VARCHAR(512) NULL,
       \`slug\` VARCHAR(32) NOT NULL,
       \`commission_percent\` DECIMAL(5,2) NOT NULL DEFAULT 50.00,
       \`recurring_mode\` ENUM('first_only','all') NOT NULL DEFAULT 'all',
       \`status\` ENUM('active','inactive') NOT NULL DEFAULT 'active',
       \`payoneer_email\` VARCHAR(255) NULL,
       \`invite_token_sent_at\` DATETIME NULL,
       \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       UNIQUE KEY \`uq_affiliates_email\` (\`email\`),
       UNIQUE KEY \`uq_affiliates_slug\` (\`slug\`),
       KEY \`idx_affiliates_user\` (\`user_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${AFFILIATE_COMMISSIONS_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`affiliate_id\` BIGINT UNSIGNED NOT NULL,
       \`buyer_user_id\` BIGINT UNSIGNED NOT NULL,
       \`payment_id\` VARCHAR(80) NOT NULL,
       \`subscription_id\` VARCHAR(64) NULL,
       \`plan\` VARCHAR(64) NULL,
       \`billing_period\` VARCHAR(32) NULL,
       \`gross_amount\` DECIMAL(12,2) NOT NULL,
       \`paddle_fee\` DECIMAL(12,2) NOT NULL,
       \`net_amount\` DECIMAL(12,2) NOT NULL,
       \`commission_percent\` DECIMAL(5,2) NOT NULL,
       \`commission_amount\` DECIMAL(12,2) NOT NULL,
       \`currency\` VARCHAR(8) NOT NULL DEFAULT 'USD',
       \`status\` ENUM('pending','approved','reversed') NOT NULL DEFAULT 'pending',
       \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       UNIQUE KEY \`uq_affiliate_commissions_payment\` (\`payment_id\`, \`affiliate_id\`),
       KEY \`idx_affiliate_commissions_affiliate_created\` (\`affiliate_id\`, \`created_at\`),
       KEY \`idx_affiliate_commissions_subscription\` (\`subscription_id\`),
       KEY \`idx_affiliate_commissions_buyer\` (\`affiliate_id\`, \`buyer_user_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${AFFILIATE_PAYOUTS_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`affiliate_id\` BIGINT UNSIGNED NOT NULL,
       \`period_start\` DATE NOT NULL,
       \`period_end\` DATE NOT NULL,
       \`amount\` DECIMAL(12,2) NOT NULL,
       \`status\` ENUM('pending','paid') NOT NULL DEFAULT 'paid',
       \`paid_at\` DATETIME NULL,
       \`paid_by\` BIGINT UNSIGNED NULL,
       \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       UNIQUE KEY \`uq_affiliate_payouts_period\` (\`affiliate_id\`, \`period_start\`),
       KEY \`idx_affiliate_payouts_period\` (\`period_start\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${AFFILIATE_LINK_HITS_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`slug\` VARCHAR(32) NOT NULL,
       \`hit_date\` DATE NOT NULL,
       \`ip_hash\` CHAR(64) NULL,
       \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       KEY \`idx_affiliate_link_hits_slug_date\` (\`slug\`, \`hit_date\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  // `ADD COLUMN IF NOT EXISTS` is MySQL 8 only; emulate with information_schema.
  if (!(await columnExists("users", "referred_by_affiliate_id"))) {
    await pool.query(
      `ALTER TABLE \`users\`
         ADD COLUMN \`referred_by_affiliate_id\` BIGINT UNSIGNED NULL DEFAULT NULL`,
    );
  }

  schemaEnsured = true;
}

type AffiliateRow = RowDataPacket & {
  id: number;
  user_id: number | null;
  email: string;
  name: string;
  social_url: string | null;
  slug: string;
  commission_percent: string | number;
  recurring_mode: AffiliateRecurringMode;
  status: AffiliateStatus;
  payoneer_email: string | null;
  invite_token_sent_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function rowToAffiliate(row: AffiliateRow): Affiliate {
  return {
    id: Number(row.id),
    userId: row.user_id == null ? null : Number(row.user_id),
    email: row.email,
    name: row.name,
    socialUrl: row.social_url,
    slug: row.slug,
    commissionPercent: Number(row.commission_percent),
    recurringMode: row.recurring_mode,
    status: row.status,
    payoneerEmail: row.payoneer_email,
    inviteTokenSentAt: toIso(row.invite_token_sent_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
}

const AFFILIATE_COLUMNS = `id, user_id, email, name, social_url, slug, commission_percent,
  recurring_mode, status, payoneer_email, invite_token_sent_at, created_at, updated_at`;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listAffiliates(): Promise<Affiliate[]> {
  await ensureAffiliateSchema();
  const [rows] = await getPool().execute<AffiliateRow[]>(
    `SELECT ${AFFILIATE_COLUMNS} FROM \`${AFFILIATES_TABLE}\` ORDER BY created_at DESC, id DESC`,
  );
  return rows.map(rowToAffiliate);
}

export async function getAffiliateById(id: number): Promise<Affiliate | null> {
  await ensureAffiliateSchema();
  const [rows] = await getPool().execute<AffiliateRow[]>(
    `SELECT ${AFFILIATE_COLUMNS} FROM \`${AFFILIATES_TABLE}\` WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? rowToAffiliate(rows[0]) : null;
}

export async function getAffiliateBySlug(slug: string): Promise<Affiliate | null> {
  const normalized = normalizeAffiliateSlug(slug);
  if (!normalized) return null;
  await ensureAffiliateSchema();
  const [rows] = await getPool().execute<AffiliateRow[]>(
    `SELECT ${AFFILIATE_COLUMNS} FROM \`${AFFILIATES_TABLE}\` WHERE slug = ? LIMIT 1`,
    [normalized],
  );
  return rows[0] ? rowToAffiliate(rows[0]) : null;
}

export async function getAffiliateByEmail(email: string): Promise<Affiliate | null> {
  await ensureAffiliateSchema();
  const [rows] = await getPool().execute<AffiliateRow[]>(
    `SELECT ${AFFILIATE_COLUMNS} FROM \`${AFFILIATES_TABLE}\` WHERE email = ? LIMIT 1`,
    [normalizeEmail(email)],
  );
  return rows[0] ? rowToAffiliate(rows[0]) : null;
}

/**
 * Partner record for a signed-in user. Invited partners are created before they
 * accept, so when `user_id` is still NULL we link it by email on first visit —
 * that is what makes the Affiliate tab appear right after they set a password.
 */
export async function getAffiliateForUser(user: {
  id: number;
  email: string;
}): Promise<Affiliate | null> {
  await ensureAffiliateSchema();
  const pool = getPool();
  const [rows] = await pool.execute<AffiliateRow[]>(
    `SELECT ${AFFILIATE_COLUMNS} FROM \`${AFFILIATES_TABLE}\`
      WHERE user_id = ? OR (user_id IS NULL AND email = ?)
      ORDER BY user_id IS NULL
      LIMIT 1`,
    [user.id, normalizeEmail(user.email)],
  );
  const row = rows[0];
  if (!row) return null;

  const affiliate = rowToAffiliate(row);
  if (affiliate.userId == null) {
    await pool.execute<ResultSetHeader>(
      `UPDATE \`${AFFILIATES_TABLE}\` SET user_id = ? WHERE id = ? AND user_id IS NULL`,
      [user.id, affiliate.id],
    );
    affiliate.userId = user.id;
  }
  return affiliate;
}

export type AffiliateCreateResult =
  | { ok: true; affiliate: Affiliate }
  | { ok: false; error: "EMAIL_TAKEN" | "SLUG_TAKEN" };

export async function createAffiliate(
  input: AffiliateCreateInput,
): Promise<AffiliateCreateResult> {
  await ensureAffiliateSchema();
  const pool = getPool();
  const email = normalizeEmail(input.email);
  const slug = normalizeAffiliateSlug(input.slug);
  if (!slug) return { ok: false, error: "SLUG_TAKEN" };

  // Link an existing account right away so the partner sees the Affiliate tab
  // without an invite round-trip.
  type UserRow = RowDataPacket & { id: number };
  const [userRows] = await pool.execute<UserRow[]>(
    `SELECT id FROM \`users\` WHERE email = ? LIMIT 1`,
    [email],
  );
  const userId = userRows[0] ? Number(userRows[0].id) : null;

  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO \`${AFFILIATES_TABLE}\`
         (user_id, email, name, social_url, slug, commission_percent, recurring_mode, status,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
      [
        userId,
        email,
        input.name.trim(),
        input.socialUrl?.trim() || null,
        slug,
        input.commissionPercent,
        input.recurringMode,
      ],
    );
    const created = await getAffiliateById(result.insertId);
    if (!created) throw new Error("affiliate row disappeared after insert");
    return { ok: true, affiliate: created };
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "ER_DUP_ENTRY") {
      const message = err instanceof Error ? err.message : "";
      return { ok: false, error: message.includes("slug") ? "SLUG_TAKEN" : "EMAIL_TAKEN" };
    }
    throw err;
  }
}

export async function updateAffiliate(
  id: number,
  patch: AffiliateUpdateInput,
): Promise<Affiliate | null> {
  await ensureAffiliateSchema();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name.trim());
  }
  if (patch.socialUrl !== undefined) {
    sets.push("social_url = ?");
    params.push(patch.socialUrl?.trim() || null);
  }
  if (patch.commissionPercent !== undefined) {
    sets.push("commission_percent = ?");
    params.push(patch.commissionPercent);
  }
  if (patch.recurringMode !== undefined) {
    sets.push("recurring_mode = ?");
    params.push(patch.recurringMode);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (sets.length === 0) return getAffiliateById(id);

  sets.push("updated_at = NOW()");
  params.push(id);
  await getPool().execute<ResultSetHeader>(
    `UPDATE \`${AFFILIATES_TABLE}\` SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return getAffiliateById(id);
}

export async function setAffiliatePayoneerEmail(
  affiliateId: number,
  payoneerEmail: string | null,
): Promise<void> {
  await ensureAffiliateSchema();
  await getPool().execute<ResultSetHeader>(
    `UPDATE \`${AFFILIATES_TABLE}\` SET payoneer_email = ?, updated_at = NOW() WHERE id = ?`,
    [payoneerEmail ? normalizeEmail(payoneerEmail) : null, affiliateId],
  );
}

export async function markAffiliateInviteSent(affiliateId: number): Promise<void> {
  await ensureAffiliateSchema();
  await getPool().execute<ResultSetHeader>(
    `UPDATE \`${AFFILIATES_TABLE}\` SET invite_token_sent_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [affiliateId],
  );
}

/** Commission rows are written from the Paddle webhook, inside its connection. */
export interface AffiliateCommissionInsert {
  affiliateId: number;
  buyerUserId: number;
  paymentId: string;
  subscriptionId: string | null;
  plan: string | null;
  billingPeriod: string | null;
  grossAmount: number;
  paddleFee: number;
  netAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  currency: string;
  status: AffiliateCommissionStatus;
}

/**
 * Insert one commission row. `INSERT IGNORE` on the `(payment_id, affiliate_id)`
 * unique key makes a redelivered webhook a no-op.
 */
export async function insertAffiliateCommission(
  conn: PoolConnection | null,
  row: AffiliateCommissionInsert,
): Promise<boolean> {
  const executor = conn ?? getPool();
  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT IGNORE INTO \`${AFFILIATE_COMMISSIONS_TABLE}\`
       (affiliate_id, buyer_user_id, payment_id, subscription_id, plan, billing_period,
        gross_amount, paddle_fee, net_amount, commission_percent, commission_amount,
        currency, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      row.affiliateId,
      row.buyerUserId,
      row.paymentId,
      row.subscriptionId,
      row.plan,
      row.billingPeriod,
      row.grossAmount,
      row.paddleFee,
      row.netAmount,
      row.commissionPercent,
      row.commissionAmount,
      row.currency,
      row.status,
    ],
  );
  return result.affectedRows > 0;
}

type CommissionRow = RowDataPacket & {
  id: number;
  affiliate_id: number;
  buyer_user_id: number;
  payment_id: string;
  subscription_id: string | null;
  plan: string | null;
  billing_period: string | null;
  gross_amount: string | number;
  paddle_fee: string | number;
  net_amount: string | number;
  commission_percent: string | number;
  commission_amount: string | number;
  currency: string;
  status: AffiliateCommissionStatus;
  created_at: Date | string;
};

export function rowToCommission(row: CommissionRow): AffiliateCommission {
  return {
    id: Number(row.id),
    affiliateId: Number(row.affiliate_id),
    buyerUserId: Number(row.buyer_user_id),
    paymentId: row.payment_id,
    subscriptionId: row.subscription_id,
    plan: row.plan,
    billingPeriod: row.billing_period,
    grossAmount: Number(row.gross_amount),
    paddleFee: Number(row.paddle_fee),
    netAmount: Number(row.net_amount),
    commissionPercent: Number(row.commission_percent),
    commissionAmount: Number(row.commission_amount),
    currency: row.currency,
    status: row.status,
    createdAt: toIso(row.created_at) ?? "",
  };
}

export const COMMISSION_COLUMNS = `id, affiliate_id, buyer_user_id, payment_id, subscription_id,
  plan, billing_period, gross_amount, paddle_fee, net_amount, commission_percent,
  commission_amount, currency, status, created_at`;

/**
 * Attribution lock: the partner who brought a subscription keeps it for every
 * later payment on the same `subscription_id` (upgrades and renewals arrive
 * without `custom_data`).
 */
export async function findAffiliateIdBySubscriptionId(
  conn: PoolConnection | null,
  subscriptionId: string,
): Promise<number | null> {
  const executor = conn ?? getPool();
  type Row = RowDataPacket & { affiliate_id: number };
  const [rows] = await executor.execute<Row[]>(
    `SELECT affiliate_id FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE subscription_id = ?
      ORDER BY id ASC
      LIMIT 1`,
    [subscriptionId],
  );
  return rows[0] ? Number(rows[0].affiliate_id) : null;
}

/** True when this partner already earned on this buyer (drives `first_only`). */
export async function hasCommissionForBuyer(
  conn: PoolConnection | null,
  affiliateId: number,
  buyerUserId: number,
): Promise<boolean> {
  const executor = conn ?? getPool();
  const [rows] = await executor.execute<CountRow[]>(
    `SELECT COUNT(*) AS c FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE affiliate_id = ? AND buyer_user_id = ? AND status <> 'reversed'`,
    [affiliateId, buyerUserId],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** Commission rows for one Paddle transaction — used to build refund reversals. */
export async function listCommissionsByPaymentId(
  conn: PoolConnection | null,
  paymentId: string,
): Promise<AffiliateCommission[]> {
  const executor = conn ?? getPool();
  const [rows] = await executor.execute<CommissionRow[]>(
    `SELECT ${COMMISSION_COLUMNS} FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE payment_id = ?`,
    [paymentId],
  );
  return rows.map(rowToCommission);
}
