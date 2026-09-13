import "server-only";

import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  AFFILIATE_COMMISSIONS_TABLE,
  AFFILIATE_LINK_HITS_TABLE,
  AFFILIATE_PAYOUTS_TABLE,
  AFFILIATES_TABLE,
  COMMISSION_COLUMNS,
  ensureAffiliateSchema,
  rowToCommission,
} from "@/lib/affiliate/db";
import {
  currentMonthPeriod,
  periodDatetimeBounds,
  previousMonthPeriod,
  type PayoutPeriod,
} from "@/lib/affiliate/payouts";
import type {
  AffiliateCommissionWithBuyer,
  AffiliatePeriodStats,
} from "@/lib/affiliate/types";

export type AffiliatePeriodKey = "current-month" | "last-month" | "custom";

export interface ResolvedAffiliatePeriod {
  key: AffiliatePeriodKey;
  /** YYYY-MM-DD inclusive. */
  from: string;
  to: string;
  label: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Period filters use UTC calendar months so "Last month" in the tables always
 * covers exactly the month the payout cycle pays for (`lib/affiliate/payouts.ts`).
 * The author earnings resolver works on local time, which would drift by a few
 * hours around month boundaries.
 */
export function resolveAffiliatePeriod(
  key: string | null | undefined,
  from?: string | null,
  to?: string | null,
): ResolvedAffiliatePeriod {
  if (key === "custom" && from && to && DATE_ONLY.test(from) && DATE_ONLY.test(to)) {
    const [start, end] = from <= to ? [from, to] : [to, from];
    return { key: "custom", from: start, to: end, label: `${start} — ${end}` };
  }
  if (key === "last-month") {
    const period = previousMonthPeriod();
    return { key: "last-month", from: period.start, to: period.end, label: period.label };
  }
  const period = currentMonthPeriod();
  return { key: "current-month", from: period.start, to: period.end, label: period.label };
}

function bounds(period: ResolvedAffiliatePeriod): [string, string] {
  return periodDatetimeBounds({ start: period.from, end: period.to, label: period.label } as PayoutPeriod);
}

type SumRow = RowDataPacket & { total: string | number | null; c: number };

/** Headline numbers for one partner over a period. */
export async function affiliatePeriodStats(
  affiliate: { id: number; slug: string },
  period: ResolvedAffiliatePeriod,
): Promise<AffiliatePeriodStats> {
  await ensureAffiliateSchema();
  const pool = getPool();
  const [from, to] = bounds(period);

  const [commissionRows] = await pool.execute<SumRow[]>(
    `SELECT SUM(commission_amount) AS total, COUNT(*) AS c
       FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE affiliate_id = ? AND created_at BETWEEN ? AND ?`,
    [affiliate.id, from, to],
  );
  const [buyerRows] = await pool.execute<SumRow[]>(
    `SELECT COUNT(DISTINCT buyer_user_id) AS c
       FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE affiliate_id = ? AND created_at BETWEEN ? AND ? AND commission_amount > 0`,
    [affiliate.id, from, to],
  );
  const [clickRows] = await pool.execute<SumRow[]>(
    `SELECT COUNT(*) AS c
       FROM \`${AFFILIATE_LINK_HITS_TABLE}\`
      WHERE slug = ? AND hit_date BETWEEN ? AND ?`,
    [affiliate.slug, period.from, period.to],
  );
  const [signupRows] = await pool.execute<SumRow[]>(
    `SELECT COUNT(*) AS c
       FROM \`users\`
      WHERE referred_by_affiliate_id = ? AND created_at BETWEEN ? AND ?`,
    [affiliate.id, from, to],
  );

  return {
    commissionTotal: Number(commissionRows[0]?.total ?? 0),
    paymentsCount: Number(commissionRows[0]?.c ?? 0),
    buyersCount: Number(buyerRows[0]?.c ?? 0),
    clicks: Number(clickRows[0]?.c ?? 0),
    signups: Number(signupRows[0]?.c ?? 0),
  };
}

export interface AdminAffiliateSummary {
  partnersActive: number;
  partnersTotal: number;
  commissionTotal: number;
  paidTotal: number;
  buyersCount: number;
}

export async function adminAffiliateSummary(
  period: ResolvedAffiliatePeriod,
): Promise<AdminAffiliateSummary> {
  await ensureAffiliateSchema();
  const pool = getPool();
  const [from, to] = bounds(period);

  type PartnersRow = RowDataPacket & { total: number; active: number };
  const [partnerRows] = await pool.execute<PartnersRow[]>(
    `SELECT COUNT(*) AS total, SUM(status = 'active') AS active FROM \`${AFFILIATES_TABLE}\``,
  );
  const [commissionRows] = await pool.execute<SumRow[]>(
    `SELECT SUM(commission_amount) AS total, COUNT(DISTINCT buyer_user_id) AS c
       FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE created_at BETWEEN ? AND ?`,
    [from, to],
  );
  const [paidRows] = await pool.execute<SumRow[]>(
    `SELECT SUM(amount) AS total FROM \`${AFFILIATE_PAYOUTS_TABLE}\` WHERE status = 'paid'`,
  );

  return {
    partnersActive: Number(partnerRows[0]?.active ?? 0),
    partnersTotal: Number(partnerRows[0]?.total ?? 0),
    commissionTotal: Number(commissionRows[0]?.total ?? 0),
    buyersCount: Number(commissionRows[0]?.c ?? 0),
    paidTotal: Number(paidRows[0]?.total ?? 0),
  };
}

export interface AdminAffiliateListRow {
  id: number;
  name: string;
  email: string;
  slug: string;
  status: "active" | "inactive";
  commissionPercent: number;
  recurringMode: "first_only" | "all";
  hasAccount: boolean;
  payoneerEmail: string | null;
  /** Unique paying buyers, all time. */
  buyersTotal: number;
  /** Commission earned inside the selected period. */
  earnedInPeriod: number;
  createdAt: string;
}

export async function listAdminAffiliateRows(
  period: ResolvedAffiliatePeriod,
): Promise<AdminAffiliateListRow[]> {
  await ensureAffiliateSchema();
  const [from, to] = bounds(period);
  type Row = RowDataPacket & {
    id: number;
    name: string;
    email: string;
    slug: string;
    status: "active" | "inactive";
    commission_percent: string | number;
    recurring_mode: "first_only" | "all";
    user_id: number | null;
    payoneer_email: string | null;
    created_at: Date | string;
    buyers_total: number | null;
    earned_in_period: string | number | null;
  };
  const [rows] = await getPool().execute<Row[]>(
    `SELECT a.id, a.name, a.email, a.slug, a.status, a.commission_percent, a.recurring_mode,
            a.user_id, a.payoneer_email, a.created_at,
            (SELECT COUNT(DISTINCT c.buyer_user_id)
               FROM \`${AFFILIATE_COMMISSIONS_TABLE}\` c
              WHERE c.affiliate_id = a.id AND c.commission_amount > 0) AS buyers_total,
            (SELECT SUM(c.commission_amount)
               FROM \`${AFFILIATE_COMMISSIONS_TABLE}\` c
              WHERE c.affiliate_id = a.id AND c.created_at BETWEEN ? AND ?) AS earned_in_period
       FROM \`${AFFILIATES_TABLE}\` a
      ORDER BY a.created_at DESC, a.id DESC`,
    [from, to],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    email: row.email,
    slug: row.slug,
    status: row.status,
    commissionPercent: Number(row.commission_percent),
    recurringMode: row.recurring_mode,
    hasAccount: row.user_id != null,
    payoneerEmail: row.payoneer_email,
    buyersTotal: Number(row.buyers_total ?? 0),
    earnedInPeriod: Number(row.earned_in_period ?? 0),
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

/**
 * Every referred payment, not an aggregate — one row per Paddle transaction with
 * the buyer attached. `isFirstPayment` is computed against the partner's whole
 * history so a period filter cannot mislabel a renewal as a first payment.
 */
export async function listAffiliateCommissionRows(input: {
  affiliateId: number;
  period: ResolvedAffiliatePeriod;
  limit?: number;
}): Promise<AffiliateCommissionWithBuyer[]> {
  await ensureAffiliateSchema();
  const pool = getPool();
  const [from, to] = bounds(input.period);
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);

  type Row = RowDataPacket & {
    buyer_email: string | null;
    buyer_name: string | null;
    buyer_created_at: Date | string | null;
  };
  const [rows] = await pool.execute<Row[]>(
    `SELECT ${COMMISSION_COLUMNS.split(",")
      .map((col) => `c.${col.trim()}`)
      .join(", ")},
            u.email AS buyer_email, u.name AS buyer_name, u.created_at AS buyer_created_at
       FROM \`${AFFILIATE_COMMISSIONS_TABLE}\` c
       LEFT JOIN \`users\` u ON u.id = c.buyer_user_id
      WHERE c.affiliate_id = ? AND c.created_at BETWEEN ? AND ?
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT ${limit}`,
    [input.affiliateId, from, to],
  );

  type FirstRow = RowDataPacket & { buyer_user_id: number; first_id: number };
  const [firstRows] = await pool.execute<FirstRow[]>(
    `SELECT buyer_user_id, MIN(id) AS first_id
       FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE affiliate_id = ? AND commission_amount > 0
      GROUP BY buyer_user_id`,
    [input.affiliateId],
  );
  const firstIdByBuyer = new Map<number, number>(
    firstRows.map((row) => [Number(row.buyer_user_id), Number(row.first_id)]),
  );

  return rows.map((row) => {
    const commission = rowToCommission(row as unknown as Parameters<typeof rowToCommission>[0]);
    return {
      ...commission,
      buyerEmail: row.buyer_email,
      buyerName: row.buyer_name,
      buyerRegisteredAt:
        row.buyer_created_at instanceof Date
          ? row.buyer_created_at.toISOString()
          : row.buyer_created_at
            ? String(row.buyer_created_at)
            : null,
      isFirstPayment: firstIdByBuyer.get(commission.buyerUserId) === commission.id,
    };
  });
}
