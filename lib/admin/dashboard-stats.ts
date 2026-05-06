import "server-only";
import type { RowDataPacket } from "mysql2";
import { endOfDay, endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

function toMysql(d: Date): string {
  return format(d, "yyyy-MM-dd HH:mm:ss");
}

export type ItemModerationStats = {
  all: number;
  approved_items: number;
  soft_reject_items: number;
  wait_approval_items: number;
  processing_items: number;
  blocked_items: number;
  rejected_items: number;
};

export type AdminDashboardData = {
  marketProfit: {
    monthly: { sales_earn: number; subscription_earn: number; refund_loss: number };
  };
  stats: ItemModerationStats;
  requestsStats: Record<string, number>;
  requestsStatsAssigned: number;
  userStats: {
    users: number;
    new_users: number;
    author_balances: number;
    partners: number;
    authors: number;
    p_authors: number;
    staffs: number;
    admins: number;
  };
  emailsBase: { newsletter: number; freebies: number };
  chartSubscriptionActive: { labels: string[]; data: number[] };
  chartDirectSales: { labels: string[]; data: number[] };
  chartPayouts: { labels: string[]; data: number[] };
  subsStats: Record<string, number>;
  directStats: Record<string, number>;
  payouts_success_total: { amount: number; count: number };
  payouts_enabled: boolean;
};

async function loadPayoutsEnabled(pool: ReturnType<typeof getPool>): Promise<boolean> {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT content FROM page_settings WHERE page = ? AND `key` = ? LIMIT 1",
      ["contibutor", "access_control"],
    );
    const raw = rows[0]?.content;
    if (raw && typeof raw === "string") {
      const j = JSON.parse(raw) as { payouts_available?: boolean };
      if (typeof j.payouts_available === "boolean") return j.payouts_available;
    }
  } catch {
    /* ignore */
  }
  return process.env.MARKETPLACE_PAYOUTS_AVAILABLE !== "false";
}

export async function getAdminDashboardData(staffUserId: number): Promise<AdminDashboardData> {
  const pool = getPool();
  const itemsTable = marketplaceItemsTable();
  const now = new Date();
  const dateFrom = startOfMonth(now);
  const dateTo = endOfMonth(now);
  const dateCurrentDay = format(now, "yyyy-MM-dd");
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);

  const [
    statsRow,
    requestsGrouped,
    requestsAssigned,
    userStatsRow,
    newsletterCount,
    freebiesCount,
    subPieRows,
    soldPieRows,
    payoutPieRows,
    soldSummary,
    refundLossResult,
    subSummaryRow,
    payoutsSuccess,
    payoutsEnabled,
  ] = await Promise.all([
    (async () => {
      const [r] = await pool.execute<RowDataPacket[]>(
        `SELECT
          (SELECT COUNT(*) FROM \`${itemsTable}\`) AS all_items,
          (SELECT COUNT(*) FROM \`${itemsTable}\` WHERE access = 1) AS approved_items,
          (SELECT COUNT(*) FROM \`${itemsTable}\` mi
            INNER JOIN approval_requires ar ON ar.item_id = mi.id AND ar.status = 'soft_reject'
            WHERE mi.access = 0) AS soft_reject_items,
          (SELECT COUNT(*) FROM \`${itemsTable}\` mi
            LEFT JOIN approval_requires ar ON ar.item_id = mi.id
            WHERE mi.access = 0 AND (ar.status IS NULL OR ar.status = 'check')) AS wait_approval_items,
          (SELECT COUNT(*) FROM \`${itemsTable}\` WHERE access = -10) AS processing_items,
          (SELECT COUNT(*) FROM \`${itemsTable}\` mi
            LEFT JOIN approval_requires ar ON ar.item_id = mi.id
            WHERE mi.access = -1 AND (ar.status IS NULL OR ar.status = 'blocked')) AS blocked_items,
          (SELECT COUNT(*) FROM \`${itemsTable}\` mi
            INNER JOIN approval_requires ar ON ar.item_id = mi.id AND ar.status = 'rejected'
            WHERE mi.access = -1) AS rejected_items`,
      );
      return r[0];
    })(),
    pool.execute<RowDataPacket[]>(
      `SELECT type, COUNT(*) AS c FROM request_messages WHERE answered IS NULL GROUP BY type`,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM request_messages WHERE answered IS NULL AND assigned_staff_id = ?`,
      [staffUserId],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE access = 0) AS users,
        (SELECT COUNT(*) FROM users WHERE access >= 0 AND created_at BETWEEN ? AND ?) AS new_users,
        (SELECT COALESCE(SUM(balance), 0) FROM users WHERE access >= 1 AND balance >= 1) AS author_balances,
        (SELECT COUNT(*) FROM users WHERE access = 1) AS partners,
        (SELECT COUNT(*) FROM users WHERE access = 2) AS authors,
        (SELECT COUNT(*) FROM users WHERE access >= 10) AS p_authors,
        (SELECT COUNT(*) FROM users WHERE access >= 50) AS staffs,
        (SELECT COUNT(*) FROM users WHERE access = 100) AS admins`,
      [toMysql(dayStart), toMysql(dayEnd)],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM free_download_emails WHERE type = 'newsletter'`,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM free_download_emails WHERE type = 'free_download'`,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT type, SUM(amount * \`count\`) AS amt FROM subscription_systems WHERE DATE(ends_at) >= ? GROUP BY type`,
      [dateCurrentDay],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT status, SUM(sold_net) AS net FROM sold_items WHERE created_at BETWEEN ? AND ? GROUP BY status`,
      [toMysql(dateFrom), toMysql(dateTo)],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT status, SUM(amount) AS amt FROM payouts WHERE created_at BETWEEN ? AND ? GROUP BY status`,
      [toMysql(dateFrom), toMysql(dateTo)],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT
        COALESCE(SUM(platform_earn), 0) AS platform_earn,
        COALESCE(SUM(ref_earn) + SUM(co_ref_earn), 0) AS affiliate_earn,
        COALESCE(SUM(author_earn) + SUM(co_earn), 0) AS authors_earn,
        COALESCE(SUM(sold_net), 0) AS sold_net,
        COUNT(*) AS sold_count,
        COALESCE(SUM(sold_summary), 0) AS sold_summary,
        COUNT(coupon_id) AS used_coupons
       FROM sold_items WHERE status = 1 AND created_at BETWEEN ? AND ?`,
      [toMysql(dateFrom), toMysql(dateTo)],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(platform_earn), 0) AS refund_loss FROM sold_items WHERE status != 1`,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT
        COALESCE(SUM(amount), 0) AS amount,
        COALESCE(SUM(amount * \`count\`), 0) AS amount_counting_period,
        COALESCE(SUM(amount_summary), 0) AS amount_summary,
        COUNT(*) AS count_rows,
        COALESCE((SELECT SUM(amount_summary) FROM subscription_systems), 0) AS amount_summary_total,
        COALESCE((SELECT COUNT(*) FROM subscription_systems), 0) AS count_total,
        COALESCE((SELECT COUNT(*) FROM subscription_systems WHERE status = 1 AND DATE(ends_at) >= ?), 0) AS count_active_status,
        COALESCE((SELECT SUM(amount * \`count\`) FROM subscription_systems WHERE status = 1), 0) AS amount_active_status,
        COALESCE((SELECT COUNT(*) FROM subscription_systems WHERE status = 0 AND created_at BETWEEN ? AND ?), 0) AS cancelled_monthly,
        COALESCE((SELECT COUNT(*) FROM subscription_systems WHERE status = -1 AND created_at BETWEEN ? AND ?), 0) AS paused_monthly
       FROM subscription_systems WHERE DATE(ends_at) >= ?`,
      [dateCurrentDay, toMysql(dateFrom), toMysql(dateTo), toMysql(dateFrom), toMysql(dateTo), dateCurrentDay],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS c FROM payouts WHERE status = 1`,
    ),
    loadPayoutsEnabled(pool),
  ]);

  const stats: ItemModerationStats = {
    all: Number(statsRow?.all_items ?? 0),
    approved_items: Number(statsRow?.approved_items ?? 0),
    soft_reject_items: Number(statsRow?.soft_reject_items ?? 0),
    wait_approval_items: Number(statsRow?.wait_approval_items ?? 0),
    processing_items: Number(statsRow?.processing_items ?? 0),
    blocked_items: Number(statsRow?.blocked_items ?? 0),
    rejected_items: Number(statsRow?.rejected_items ?? 0),
  };

  const requestsStats: Record<string, number> = {};
  for (const row of requestsGrouped[0]) {
    requestsStats[String(row.type)] = Number(row.c ?? 0);
  }

  const us = userStatsRow[0][0];
  const userStats = {
    users: Number(us?.users ?? 0),
    new_users: Number(us?.new_users ?? 0),
    author_balances: Number(us?.author_balances ?? 0),
    partners: Number(us?.partners ?? 0),
    authors: Number(us?.authors ?? 0),
    p_authors: Number(us?.p_authors ?? 0),
    staffs: Number(us?.staffs ?? 0),
    admins: Number(us?.admins ?? 0),
  };

  const pieSubs = subPieRows[0];
  const chartSubscriptionActive =
    pieSubs.length === 0
      ? { labels: ["No active subscriptions"], data: [0] }
      : {
          labels: pieSubs.map((row) => `${String(row.type ?? "plan")}: $${Number(row.amt ?? 0)}`),
          data: pieSubs.map((row) => Number(row.amt ?? 0)),
        };

  const soldMap: Record<string, number> = {};
  for (const row of soldPieRows[0]) {
    soldMap[String(row.status)] = Number(row.net ?? 0);
  }
  const chartDirectSales = {
    labels: [
      `Success: $${soldMap["1"] ?? 0}`,
      `Refunded: $${soldMap["0"] ?? 0}`,
      `Cancelled: $${soldMap["-1"] ?? 0}`,
    ],
    data: [soldMap["1"] ?? 0, soldMap["0"] ?? 0, soldMap["-1"] ?? 0],
  };

  const payoutMap: Record<string, number> = {};
  for (const row of payoutPieRows[0]) {
    payoutMap[String(row.status)] = Number(row.amt ?? 0);
  }
  const chartPayouts = {
    labels: [
      `Success $${payoutMap["1"] ?? 0}`,
      `Awaiting $${payoutMap["0"] ?? 0}`,
      `Cancelled $${payoutMap["-1"] ?? 0}`,
      `Reserved $${payoutMap["-2"] ?? 0}`,
      `Unavailable $${payoutMap["-3"] ?? 0}`,
    ],
    data: [
      payoutMap["1"] ?? 0,
      payoutMap["0"] ?? 0,
      payoutMap["-1"] ?? 0,
      payoutMap["-2"] ?? 0,
      payoutMap["-3"] ?? 0,
    ],
  };

  const ds = soldSummary[0][0];
  const refundLoss = Number(refundLossResult[0][0]?.refund_loss ?? 0);
  const directStats: Record<string, number> = {
    platform_earn: Number(ds?.platform_earn ?? 0),
    affiliate_earn: Number(ds?.affiliate_earn ?? 0),
    authors_earn: Number(ds?.authors_earn ?? 0),
    sold_net: Number(ds?.sold_net ?? 0),
    sold_count: Number(ds?.sold_count ?? 0),
    sold_summary: Number(ds?.sold_summary ?? 0),
    used_coupons: Number(ds?.used_coupons ?? 0),
    refund_loss: refundLoss,
    payment_tax_avg: Number(ds?.sold_summary ?? 0) - Number(ds?.sold_net ?? 0),
  };

  const sr = subSummaryRow[0][0];
  const subsStats: Record<string, number> = {
    amount: Number(sr?.amount ?? 0),
    amount_counting_period: Number(sr?.amount_counting_period ?? 0),
    amount_summary: Number(sr?.amount_summary ?? 0),
    count: Number(sr?.count_rows ?? 0),
    amount_summary_total: Number(sr?.amount_summary_total ?? 0),
    count_total: Number(sr?.count_total ?? 0),
    count_active_status: Number(sr?.count_active_status ?? 0),
    amount_active_status: Number(sr?.amount_active_status ?? 0),
    cancelled_monthly: Number(sr?.cancelled_monthly ?? 0),
    paused_monthly: Number(sr?.paused_monthly ?? 0),
  };

  const soldPlatformEarn = directStats.platform_earn - directStats.affiliate_earn;
  const subscriptionPlatformEarn = subsStats.amount / 2;

  return {
    marketProfit: {
      monthly: {
        sales_earn: Math.round(soldPlatformEarn * 100) / 100,
        subscription_earn: Math.round(subscriptionPlatformEarn * 100) / 100,
        refund_loss: Math.round(directStats.refund_loss * 100) / 100,
      },
    },
    stats,
    requestsStats,
    requestsStatsAssigned: Number(requestsAssigned[0][0]?.c ?? 0),
    userStats,
    emailsBase: {
      newsletter: Number(newsletterCount[0][0]?.c ?? 0),
      freebies: Number(freebiesCount[0][0]?.c ?? 0),
    },
    chartSubscriptionActive,
    chartDirectSales,
    chartPayouts,
    subsStats,
    directStats,
    payouts_success_total: {
      amount: Number(payoutsSuccess[0][0]?.amount ?? 0),
      count: Number(payoutsSuccess[0][0]?.c ?? 0),
    },
    payouts_enabled: payoutsEnabled,
  };
}
