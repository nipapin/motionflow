import "server-only";

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { normalizeAffiliateCampaign, normalizeAffiliateRef, normalizeAffiliateSlug } from "@/lib/affiliate/shared";
import type {
  Affiliate,
  AffiliateCampaignLink,
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
export const AFFILIATE_CAMPAIGNS_TABLE = "affiliate_campaigns";

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

  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${AFFILIATE_CAMPAIGNS_TABLE}\` (
       \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       \`affiliate_id\` BIGINT UNSIGNED NOT NULL,
       \`code\` VARCHAR(48) NOT NULL,
       \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (\`id\`),
       UNIQUE KEY \`uq_affiliate_campaigns_code\` (\`affiliate_id\`, \`code\`),
       KEY \`idx_affiliate_campaigns_affiliate\` (\`affiliate_id\`)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  if (!(await columnExists("users", "referred_by_affiliate_id"))) {
    await pool.query(
      `ALTER TABLE \`users\`
         ADD COLUMN \`referred_by_affiliate_id\` BIGINT UNSIGNED NULL DEFAULT NULL`,
    );
  }
  if (!(await columnExists("users", "referred_by_campaign"))) {
    await pool.query(
      `ALTER TABLE \`users\`
         ADD COLUMN \`referred_by_campaign\` VARCHAR(48) NULL DEFAULT NULL`,
    );
  }
  if (!(await columnExists(AFFILIATE_COMMISSIONS_TABLE, "campaign"))) {
    await pool.query(
      `ALTER TABLE \`${AFFILIATE_COMMISSIONS_TABLE}\`
         ADD COLUMN \`campaign\` VARCHAR(48) NULL DEFAULT NULL AFTER \`billing_period\``,
    );
  }
  if (!(await columnExists(AFFILIATE_LINK_HITS_TABLE, "campaign"))) {
    await pool.query(
      `ALTER TABLE \`${AFFILIATE_LINK_HITS_TABLE}\`
         ADD COLUMN \`campaign\` VARCHAR(48) NULL DEFAULT NULL AFTER \`slug\``,
    );
  }
  if (!(await columnExists(AFFILIATE_LINK_HITS_TABLE, "referrer_host"))) {
    await pool.query(
      `ALTER TABLE \`${AFFILIATE_LINK_HITS_TABLE}\`
         ADD COLUMN \`referrer_host\` VARCHAR(191) NULL DEFAULT NULL AFTER \`ip_hash\``,
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

/**
 * Resolve `?ref=plownik-email-september` to the partner whose slug is the longest
 * prefix (`plownik`, not a shorter `plo`). Exact slug still wins when there is
 * no `-campaign` suffix.
 */
export async function getAffiliateByRef(fullRef: string): Promise<Affiliate | null> {
  const ref = normalizeAffiliateRef(fullRef);
  if (!ref) return null;
  await ensureAffiliateSchema();
  const [rows] = await getPool().execute<AffiliateRow[]>(
    `SELECT ${AFFILIATE_COLUMNS} FROM \`${AFFILIATES_TABLE}\`
      WHERE slug = ? OR ? LIKE CONCAT(slug, '-%')
      ORDER BY CHAR_LENGTH(slug) DESC
      LIMIT 1`,
    [ref, ref],
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

/**
 * Hard-delete a partner and their affiliate rows. The Motion Flow user account
 * stays. Referral first-touch on buyers is cleared so a later partner can own
 * those signups; the slug becomes free again.
 */
export async function deleteAffiliate(id: number): Promise<boolean> {
  await ensureAffiliateSchema();
  const existing = await getAffiliateById(id);
  if (!existing) return false;

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `DELETE FROM \`${AFFILIATE_COMMISSIONS_TABLE}\` WHERE affiliate_id = ?`,
      [id],
    );
    await conn.execute(
      `DELETE FROM \`${AFFILIATE_PAYOUTS_TABLE}\` WHERE affiliate_id = ?`,
      [id],
    );
    await conn.execute(
      `DELETE FROM \`${AFFILIATE_CAMPAIGNS_TABLE}\` WHERE affiliate_id = ?`,
      [id],
    );
    await conn.execute(
      `DELETE FROM \`${AFFILIATE_LINK_HITS_TABLE}\` WHERE slug = ?`,
      [existing.slug],
    );
    await conn.execute(
      `UPDATE \`users\`
          SET referred_by_affiliate_id = NULL, referred_by_campaign = NULL
        WHERE referred_by_affiliate_id = ?`,
      [id],
    );
    await conn.execute(`DELETE FROM \`${AFFILIATES_TABLE}\` WHERE id = ?`, [id]);
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
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
  campaign: string | null;
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
  await ensureAffiliateSchema();
  const executor = conn ?? getPool();
  const [result] = await executor.execute<ResultSetHeader>(
    `INSERT IGNORE INTO \`${AFFILIATE_COMMISSIONS_TABLE}\`
       (affiliate_id, buyer_user_id, payment_id, subscription_id, plan, billing_period,
        campaign, gross_amount, paddle_fee, net_amount, commission_percent, commission_amount,
        currency, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      row.affiliateId,
      row.buyerUserId,
      row.paymentId,
      row.subscriptionId,
      row.plan,
      row.billingPeriod,
      row.campaign,
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
  campaign: string | null;
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
    campaign: row.campaign ?? null,
    currency: row.currency,
    status: row.status,
    createdAt: toIso(row.created_at) ?? "",
  };
}

export const COMMISSION_COLUMNS = `id, affiliate_id, buyer_user_id, payment_id, subscription_id,
  plan, billing_period, campaign, gross_amount, paddle_fee, net_amount, commission_percent,
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

export async function findCampaignBySubscriptionId(
  conn: PoolConnection | null,
  subscriptionId: string,
): Promise<string | null> {
  const executor = conn ?? getPool();
  type Row = RowDataPacket & { campaign: string | null };
  const [rows] = await executor.execute<Row[]>(
    `SELECT campaign FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE subscription_id = ? AND campaign IS NOT NULL AND campaign <> ''
      ORDER BY id ASC
      LIMIT 1`,
    [subscriptionId],
  );
  return rows[0]?.campaign ?? null;
}

export async function findCampaignByBuyer(
  conn: PoolConnection | null,
  buyerUserId: number,
): Promise<string | null> {
  const executor = conn ?? getPool();
  type Row = RowDataPacket & { referred_by_campaign: string | null };
  const [rows] = await executor.execute<Row[]>(
    `SELECT referred_by_campaign FROM \`users\` WHERE id = ? LIMIT 1`,
    [buyerUserId],
  );
  return rows[0]?.referred_by_campaign ?? null;
}

export async function listAffiliateCampaigns(affiliateId: number): Promise<AffiliateCampaignLink[]> {
  await ensureAffiliateSchema();
  type Row = RowDataPacket & { code: string; created_at: Date | string };
  const [rows] = await getPool().execute<Row[]>(
    `SELECT code, created_at FROM \`${AFFILIATE_CAMPAIGNS_TABLE}\`
      WHERE affiliate_id = ?
      ORDER BY created_at DESC, id DESC`,
    [affiliateId],
  );
  return rows.map((row) => ({
    code: row.code,
    createdAt: toIso(row.created_at) ?? "",
  }));
}

export async function rememberAffiliateCampaign(
  affiliateId: number,
  code: string,
): Promise<void> {
  const campaign = normalizeAffiliateCampaign(code);
  if (!campaign) return;
  await ensureAffiliateSchema();
  await getPool().execute<ResultSetHeader>(
    `INSERT IGNORE INTO \`${AFFILIATE_CAMPAIGNS_TABLE}\` (affiliate_id, code, created_at)
     VALUES (?, ?, NOW())`,
    [affiliateId, campaign],
  );
}

export async function createAffiliateCampaign(
  affiliateId: number,
  code: string,
): Promise<{ ok: true; campaign: AffiliateCampaignLink } | { ok: false; error: "INVALID" | "TAKEN" }> {
  const campaign = normalizeAffiliateCampaign(code);
  if (!campaign) return { ok: false, error: "INVALID" };
  await ensureAffiliateSchema();
  try {
    await getPool().execute<ResultSetHeader>(
      `INSERT INTO \`${AFFILIATE_CAMPAIGNS_TABLE}\` (affiliate_id, code, created_at)
       VALUES (?, ?, NOW())`,
      [affiliateId, campaign],
    );
    return {
      ok: true,
      campaign: { code: campaign, createdAt: new Date().toISOString() },
    };
  } catch (err) {
    const sqlCode = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (sqlCode === "ER_DUP_ENTRY") return { ok: false, error: "TAKEN" };
    throw err;
  }
}
