import "server-only";
import type { RowDataPacket } from "mysql2";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { getPool } from "@/lib/db";

function toMysql(d: Date): string {
  return format(d, "yyyy-MM-dd HH:mm:ss");
}

export type SubscriptionAnalytics = {
  table: { label: string; value: string }[];
  perAuthor: Array<{
    author_id: number;
    author_name: string | null;
    income: number;
    downloads: number;
    average_weight: number;
  }>;
  monthLabel: string;
};

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(n);
}

function num(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);
}

export async function getSubscriptionAnalytics(): Promise<SubscriptionAnalytics> {
  const pool = getPool();
  const now = new Date();
  const startMonth = startOfMonth(now);
  const endMonth = endOfMonth(now);
  const todayDate = format(now, "yyyy-MM-dd");

  const [
    authorEarnRows,
    passiveMoneyRows,
    globalSummariesRows,
    perAuthorRows,
  ] = await Promise.all([
    // SubscriptionDownloads::getSummaryIncome
    pool.execute<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(income), 0) AS income,
         COALESCE(AVG(NULLIF(income, 0)), 0) AS average,
         COALESCE(SUM(downloads), 0) AS downloads
       FROM subscription_downloads
       WHERE created_at BETWEEN ? AND ?`,
      [toMysql(startMonth), toMysql(endMonth)],
    ),
    // SubscriptionSystem::bonusMoneyPerAuthorAmount → approximate as avg amount across active subs in period
    pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(AVG(amount), 0) AS bonus
         FROM subscription_systems
         WHERE created_at BETWEEN ? AND ?`,
      [toMysql(startMonth), toMysql(endMonth)],
    ),
    // SubscriptionSystem::getSubscriptionsSummaries_admin (combined snapshot)
    pool.execute<RowDataPacket[]>(
      `SELECT
        (SELECT COUNT(DISTINCT author_id) FROM subscription_downloads WHERE created_at BETWEEN ? AND ?) AS unique_author_downloaded,
        (SELECT COUNT(DISTINCT buyer_id) FROM subscription_downloads WHERE created_at BETWEEN ? AND ?) AS active_subscriber_downloaded,
        (SELECT COUNT(*) FROM subscription_systems WHERE DATE(ends_at) >= ?) AS count,
        (SELECT COUNT(*) FROM subscription_systems WHERE status = 1 AND DATE(ends_at) >= ?) AS count_active_status,
        (SELECT COALESCE(SUM(amount * \`count\`), 0) FROM subscription_systems WHERE status = 1 AND DATE(ends_at) >= ?) AS amount,
        (SELECT COALESCE(SUM(amount), 0) FROM subscription_systems WHERE DATE(ends_at) >= ?) AS amount_net,
        (SELECT COUNT(*) FROM subscription_systems WHERE status = 0 AND created_at BETWEEN ? AND ?) AS cancelled_monthly,
        (SELECT COUNT(*) FROM subscription_systems WHERE status = -1 AND created_at BETWEEN ? AND ?) AS paused_monthly`,
      [
        toMysql(startMonth),
        toMysql(endMonth),
        toMysql(startMonth),
        toMysql(endMonth),
        todayDate,
        todayDate,
        todayDate,
        todayDate,
        toMysql(startMonth),
        toMysql(endMonth),
        toMysql(startMonth),
        toMysql(endMonth),
      ],
    ),
    // Per-author income breakdown
    pool.execute<RowDataPacket[]>(
      `SELECT sd.author_id,
              u.name AS author_name,
              SUM(sd.income) AS income,
              SUM(sd.downloads) AS downloads,
              AVG(NULLIF(sd.income, 0)) AS average_weight
         FROM subscription_downloads sd
         LEFT JOIN users u ON u.id = sd.author_id
         WHERE sd.created_at BETWEEN ? AND ?
         GROUP BY sd.author_id, u.name
         ORDER BY income DESC
         LIMIT 100`,
      [toMysql(startMonth), toMysql(endMonth)],
    ),
  ]).catch((err) => {
    // subscription_downloads may have a different shape; surface a soft error
    throw err;
  });

  const ae = authorEarnRows[0][0];
  const pm = passiveMoneyRows[0][0];
  const gs = globalSummariesRows[0][0];

  const income = Number(ae?.income ?? 0);
  const average = Number(ae?.average ?? 0);
  const downloads = Number(ae?.downloads ?? 0);
  const passiveBonus = Number(pm?.bonus ?? 0);
  const uniqueAuthorDownloaded = Number(gs?.unique_author_downloaded ?? 0);
  const activeSubscriberDownloaded = Number(gs?.active_subscriber_downloaded ?? 0);
  const count = Number(gs?.count ?? 0);
  const countActive = Number(gs?.count_active_status ?? 0);
  const amount = Number(gs?.amount ?? 0);
  const amountNet = Number(gs?.amount_net ?? 0);
  const cancelled = Number(gs?.cancelled_monthly ?? 0);
  const paused = Number(gs?.paused_monthly ?? 0);
  const passiveSubscribers = Math.max(0, count - activeSubscriberDownloaded);

  const table: { label: string; value: string }[] = [
    { label: "[Authors] Income", value: money(income) },
    { label: "[Authors] Average Weight", value: num(average) },
    { label: "[Authors] Downloads Total", value: num(downloads) },
    { label: "[Authors] Unique Authors Count (downloaded items)", value: num(uniqueAuthorDownloaded) },
    { label: "[Subscriber] Has Downloads Users", value: num(activeSubscriberDownloaded) },
    { label: "[Passive Subscriber] No Downloads Users", value: num(passiveSubscribers) },
    { label: "[Passive Subscriber] Bonus per Author (avg)", value: money(passiveBonus) },
    { label: "[Passive Subscriber] Bonus Summary", value: money(passiveBonus * uniqueAuthorDownloaded) },
    { label: "[Subscriber] Active or Not Ended Count", value: num(count) },
    { label: "[Subscriber] Active Status Count", value: num(countActive) },
    { label: "[Subscriber] Earned Net", value: `${money(amount)} / ${money(amount / 2)}` },
    { label: "[Subscriber] Net amount (sum)", value: money(amountNet) },
    { label: "[Subscriber] Paused / Cancelled", value: `${num(paused)} / ${num(cancelled)}` },
  ];

  const perAuthor = perAuthorRows[0].map((r) => ({
    author_id: Number(r.author_id ?? 0),
    author_name: r.author_name == null ? null : String(r.author_name),
    income: Number(r.income ?? 0),
    downloads: Number(r.downloads ?? 0),
    average_weight: Number(r.average_weight ?? 0),
  }));

  return {
    table,
    perAuthor,
    monthLabel: format(now, "MMMM yyyy"),
  };
}
