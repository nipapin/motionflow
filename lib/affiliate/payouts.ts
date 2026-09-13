import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  AFFILIATE_COMMISSIONS_TABLE,
  AFFILIATE_PAYOUTS_TABLE,
  AFFILIATES_TABLE,
  ensureAffiliateSchema,
} from "@/lib/affiliate/db";
import type { AffiliatePayout, AffiliatePayoutStatus } from "@/lib/affiliate/types";

/**
 * Payout cycle: on the 15th we pay the previous calendar month. Month boundaries
 * are UTC (surfaced in the UI) and commission `created_at` is compared against
 * them directly, which assumes the MySQL session runs in UTC like the rest of
 * the app's `NOW()` writes.
 */
export const PAYOUT_DAY_OF_MONTH = 15;

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export interface PayoutPeriod {
  /** YYYY-MM-DD (inclusive). */
  start: string;
  /** YYYY-MM-DD (inclusive). */
  end: string;
  /** e.g. "Aug 2026". */
  label: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function utcMonthPeriod(year: number, monthIndex: number): PayoutPeriod {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));
  return {
    start: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`,
    end: `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`,
    label: `${MONTH_LABELS[start.getUTCMonth()]} ${start.getUTCFullYear()}`,
  };
}

export function currentMonthPeriod(now: Date = new Date()): PayoutPeriod {
  return utcMonthPeriod(now.getUTCFullYear(), now.getUTCMonth());
}

export function previousMonthPeriod(now: Date = new Date()): PayoutPeriod {
  return utcMonthPeriod(now.getUTCFullYear(), now.getUTCMonth() - 1);
}

/** Inclusive DATETIME bounds for SQL `BETWEEN` on a period. */
export function periodDatetimeBounds(period: PayoutPeriod): [string, string] {
  return [`${period.start} 00:00:00`, `${period.end} 23:59:59`];
}

type PayoutRow = RowDataPacket & {
  id: number;
  affiliate_id: number;
  period_start: Date | string;
  period_end: Date | string;
  amount: string | number;
  status: AffiliatePayoutStatus;
  paid_at: Date | string | null;
  paid_by: number | null;
};

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  return String(value).slice(0, 10);
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function rowToPayout(row: PayoutRow): AffiliatePayout {
  return {
    id: Number(row.id),
    affiliateId: Number(row.affiliate_id),
    periodStart: toDateOnly(row.period_start),
    periodEnd: toDateOnly(row.period_end),
    amount: Number(row.amount),
    status: row.status,
    paidAt: toIso(row.paid_at),
    paidBy: row.paid_by == null ? null : Number(row.paid_by),
  };
}

export interface DuePayoutRow {
  affiliateId: number;
  affiliateName: string;
  affiliateEmail: string;
  affiliateSlug: string;
  affiliateStatus: "active" | "inactive";
  payoneerEmail: string | null;
  amount: number;
  period: PayoutPeriod;
}

/**
 * Unpaid balance per partner for a period. Deactivated partners are included on
 * purpose: they stop earning, but whatever they already earned still has to be
 * payable or the money would be stuck.
 */
export async function listDuePayouts(
  period: PayoutPeriod = previousMonthPeriod(),
): Promise<DuePayoutRow[]> {
  await ensureAffiliateSchema();
  const [from, to] = periodDatetimeBounds(period);
  type Row = RowDataPacket & {
    id: number;
    name: string;
    email: string;
    slug: string;
    status: "active" | "inactive";
    payoneer_email: string | null;
    amount: string | number;
  };
  const [rows] = await getPool().execute<Row[]>(
    `SELECT a.id, a.name, a.email, a.slug, a.status, a.payoneer_email,
            SUM(c.commission_amount) AS amount
       FROM \`${AFFILIATES_TABLE}\` a
       JOIN \`${AFFILIATE_COMMISSIONS_TABLE}\` c
         ON c.affiliate_id = a.id AND c.created_at BETWEEN ? AND ?
       LEFT JOIN \`${AFFILIATE_PAYOUTS_TABLE}\` p
         ON p.affiliate_id = a.id AND p.period_start = ?
      WHERE p.id IS NULL
      GROUP BY a.id, a.name, a.email, a.slug, a.status, a.payoneer_email
     HAVING amount > 0
      ORDER BY amount DESC`,
    [from, to, period.start],
  );

  return rows.map((row) => ({
    affiliateId: Number(row.id),
    affiliateName: row.name,
    affiliateEmail: row.email,
    affiliateSlug: row.slug,
    affiliateStatus: row.status,
    payoneerEmail: row.payoneer_email,
    amount: Number(row.amount),
    period,
  }));
}

export interface PaidPayoutRow extends AffiliatePayout {
  affiliateName: string;
  affiliateEmail: string;
  affiliateSlug: string;
  payoneerEmail: string | null;
}

export async function listPayoutHistory(): Promise<PaidPayoutRow[]> {
  await ensureAffiliateSchema();
  type Row = PayoutRow & {
    name: string;
    email: string;
    slug: string;
    payoneer_email: string | null;
  };
  const [rows] = await getPool().execute<Row[]>(
    `SELECT p.id, p.affiliate_id, p.period_start, p.period_end, p.amount, p.status,
            p.paid_at, p.paid_by, a.name, a.email, a.slug, a.payoneer_email
       FROM \`${AFFILIATE_PAYOUTS_TABLE}\` p
       JOIN \`${AFFILIATES_TABLE}\` a ON a.id = p.affiliate_id
      ORDER BY p.period_start DESC, p.id DESC`,
  );
  return rows.map((row) => ({
    ...rowToPayout(row),
    affiliateName: row.name,
    affiliateEmail: row.email,
    affiliateSlug: row.slug,
    payoneerEmail: row.payoneer_email,
  }));
}

export async function listPayoutsForAffiliate(affiliateId: number): Promise<AffiliatePayout[]> {
  await ensureAffiliateSchema();
  const [rows] = await getPool().execute<PayoutRow[]>(
    `SELECT id, affiliate_id, period_start, period_end, amount, status, paid_at, paid_by
       FROM \`${AFFILIATE_PAYOUTS_TABLE}\`
      WHERE affiliate_id = ?
      ORDER BY period_start DESC`,
    [affiliateId],
  );
  return rows.map(rowToPayout);
}

/** Commission total for one partner in a period (drives the pending statement). */
export async function commissionTotalForPeriod(
  affiliateId: number,
  period: PayoutPeriod,
): Promise<number> {
  await ensureAffiliateSchema();
  const [from, to] = periodDatetimeBounds(period);
  type Row = RowDataPacket & { total: string | number | null };
  const [rows] = await getPool().execute<Row[]>(
    `SELECT SUM(commission_amount) AS total
       FROM \`${AFFILIATE_COMMISSIONS_TABLE}\`
      WHERE affiliate_id = ? AND created_at BETWEEN ? AND ?`,
    [affiliateId, from, to],
  );
  return Number(rows[0]?.total ?? 0);
}

/** What the partner sees: paid history plus the not-yet-paid previous month. */
export interface AffiliateStatement {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  status: AffiliatePayoutStatus;
  paidAt: string | null;
}

export async function listAffiliateStatements(
  affiliateId: number,
  now: Date = new Date(),
): Promise<AffiliateStatement[]> {
  const [payouts, previous] = await Promise.all([
    listPayoutsForAffiliate(affiliateId),
    Promise.resolve(previousMonthPeriod(now)),
  ]);

  const statements: AffiliateStatement[] = payouts.map((payout) => ({
    periodLabel: monthLabelFromDate(payout.periodStart),
    periodStart: payout.periodStart,
    periodEnd: payout.periodEnd,
    amount: payout.amount,
    status: payout.status,
    paidAt: payout.paidAt,
  }));

  const hasPrevious = payouts.some((payout) => payout.periodStart === previous.start);
  if (!hasPrevious) {
    const amount = await commissionTotalForPeriod(affiliateId, previous);
    if (amount > 0) {
      statements.unshift({
        periodLabel: previous.label,
        periodStart: previous.start,
        periodEnd: previous.end,
        amount,
        status: "pending",
        paidAt: null,
      });
    }
  }
  return statements;
}

export function monthLabelFromDate(dateOnly: string): string {
  const [year, month] = dateOnly.split("-");
  const monthIndex = Number(month) - 1;
  return `${MONTH_LABELS[monthIndex] ?? month} ${year}`;
}

export type MarkPaidResult =
  | { ok: true; payoutId: number; amount: number }
  | { ok: false; error: "NOTHING_DUE" | "ALREADY_PAID" };

/**
 * Close a period for one partner. The `(affiliate_id, period_start)` unique key
 * is what guarantees the same month can never be paid twice.
 */
export async function markAffiliatePayoutPaid(input: {
  affiliateId: number;
  period: PayoutPeriod;
  adminUserId: number;
}): Promise<MarkPaidResult> {
  await ensureAffiliateSchema();
  const amount = await commissionTotalForPeriod(input.affiliateId, input.period);
  if (amount <= 0) return { ok: false, error: "NOTHING_DUE" };

  const [result] = await getPool().execute<ResultSetHeader>(
    `INSERT IGNORE INTO \`${AFFILIATE_PAYOUTS_TABLE}\`
       (affiliate_id, period_start, period_end, amount, status, paid_at, paid_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'paid', NOW(), ?, NOW(), NOW())`,
    [input.affiliateId, input.period.start, input.period.end, amount, input.adminUserId],
  );
  if (result.affectedRows === 0) return { ok: false, error: "ALREADY_PAID" };
  return { ok: true, payoutId: result.insertId, amount };
}

/** Total already paid out across all partners (admin summary tile). */
export async function totalPaidOut(): Promise<number> {
  await ensureAffiliateSchema();
  type Row = RowDataPacket & { total: string | number | null };
  const [rows] = await getPool().execute<Row[]>(
    `SELECT SUM(amount) AS total FROM \`${AFFILIATE_PAYOUTS_TABLE}\` WHERE status = 'paid'`,
  );
  return Number(rows[0]?.total ?? 0);
}
