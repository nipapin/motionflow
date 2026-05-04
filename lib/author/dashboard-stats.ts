import "server-only";
import type { FieldPacket, RowDataPacket } from "mysql2";
import type { SqlParams } from "@/lib/author/sql-params";
import { endOfDay, endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import { indexCategoryLabel } from "@/lib/author/category-labels";

function toMysql(d: Date): string {
  return format(d, "yyyy-MM-dd HH:mm:ss");
}

export type DirectSalesSlice = { earned: number; count: number };
export type AffiliateSlice = { earned: number; count: number };
export type SubscriptionSlice = {
  earned: number;
  count: number;
  average: number;
};

export type SearchQueryRow = {
  query: string;
  section: string;
  slug: string;
  found: number;
  views: number;
};

export type CategoryCount = { slug: string; label: string; count: number };

export type DashboardStats = {
  balance: number;
  inFavorites: number;
  receivedBadges: number;
  itemsTotalPublished: number;
  newItemsThisMonth: number;
  earnSales: { today: DirectSalesSlice; month: DirectSalesSlice };
  earnAffiliate: { today: AffiliateSlice; month: AffiliateSlice };
  earnSubscription: {
    todayCount: number;
    month: SubscriptionSlice;
  };
  popularSearchQueries: SearchQueryRow[];
  categoryChart: CategoryCount[];
  announces: unknown | null;
};

async function getAuthorProfitForPeriod(
  authorId: number,
  from: Date | null,
  to: Date | null,
): Promise<DirectSalesSlice> {
  const pool = getPool();
  let sql = `SELECT
    COALESCE(SUM(IF(sold_items.co_author_id = ?, sold_items.co_earn, sold_items.author_earn)), 0) AS earned,
    COUNT(sold_items.id) AS purchased_count
    FROM sold_items
    WHERE (sold_items.author_id = ? OR sold_items.co_author_id = ?)
      AND sold_items.status = 1`;
  const params: SqlParams = [authorId, authorId, authorId];
  if (from && to) {
    sql += ` AND sold_items.created_at BETWEEN ? AND ?`;
    params.push(toMysql(from), toMysql(to));
  }
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  const r = rows[0];
  return {
    earned: Number(r?.earned ?? 0),
    count: Number(r?.purchased_count ?? 0),
  };
}

async function getAffiliateProfitForPeriod(
  authorId: number,
  from: Date | null,
  to: Date | null,
): Promise<AffiliateSlice> {
  const pool = getPool();
  let sql = `SELECT
    COALESCE(SUM(sold_items.ref_earn), 0) AS earned,
    COUNT(sold_items.id) AS sold_count
    FROM short_links
    LEFT JOIN sold_items ON sold_items.ref_link_id = short_links.id AND sold_items.status = 1
    WHERE short_links.bind_id = ?`;
  const params: SqlParams = [authorId];
  if (from && to) {
    sql += ` AND sold_items.created_at BETWEEN ? AND ?`;
    params.push(toMysql(from), toMysql(to));
  }
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  const r = rows[0];
  return {
    earned: Number(r?.earned ?? 0),
    count: Number(r?.sold_count ?? 0),
  };
}

export async function getAuthorSubscriptionIncome(
  authorId: number,
  from: Date,
  to: Date,
): Promise<SubscriptionSlice> {
  const pool = getPool();
  const sql = `
    WITH avg_row AS (
      SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(amount) / COUNT(*) END AS avg_w
      FROM subscription_systems
      WHERE DATE(ends_at) >= CURDATE()
    ),
    weighter AS (
      SELECT ar.avg_w / NULLIF(COUNT(sd1.id), 0) AS per_user,
             sd1.user_id AS uid,
             COUNT(sd1.id) AS cnt
      FROM subscription_downloads sd1
      CROSS JOIN avg_row ar
      WHERE sd1.created_at >= ? AND sd1.created_at <= ?
      GROUP BY sd1.user_id, ar.avg_w
    )
    SELECT
      ROUND(COALESCE(SUM(w.per_user), 0), 2) AS income,
      ROUND(COALESCE(AVG(w.per_user), 0), 2) AS average,
      COUNT(sd.id) AS downloads
    FROM subscription_downloads sd
    INNER JOIN weighter w ON w.uid = sd.user_id
    WHERE sd.author_id = ?
      AND sd.created_at >= ? AND sd.created_at <= ?
  `;
  try {
    const subParams: SqlParams = [
      toMysql(from),
      toMysql(to),
      authorId,
      toMysql(from),
      toMysql(to),
    ];
    const [rows] = await pool.execute<RowDataPacket[]>(sql, subParams);
    const r = rows[0];
    return {
      earned: Number(r?.income ?? 0),
      average: Number(r?.average ?? 0),
      count: Number(r?.downloads ?? 0),
    };
  } catch (e) {
    console.warn("[dashboard-stats] subscription income query failed", e);
    return { earned: 0, average: 0, count: 0 };
  }
}

export async function getDashboardStats(authorId: number): Promise<DashboardStats> {
  const pool = getPool();
  const now = new Date();
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const itemsTable = marketplaceItemsTable();

  const [
    userRes,
    earnSalesToday,
    earnSalesMonth,
    earnAffToday,
    earnAffMonth,
    subTodayCount,
    subMonth,
    favoritesRes,
    badgesRes,
    catRes,
    newMonthRes,
    searchRes,
    announceRes,
  ] = await Promise.all([
    pool.execute<RowDataPacket[]>("SELECT balance FROM users WHERE id = ? LIMIT 1", [authorId]),
    getAuthorProfitForPeriod(authorId, dayStart, dayEnd),
    getAuthorProfitForPeriod(authorId, monthStart, monthEnd),
    getAffiliateProfitForPeriod(authorId, dayStart, dayEnd),
    getAffiliateProfitForPeriod(authorId, monthStart, monthEnd),
    (async () => {
      const [r] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(id) AS c FROM subscription_downloads
         WHERE author_id = ? AND created_at BETWEEN ? AND ?`,
        [authorId, toMysql(dayStart), toMysql(dayEnd)],
      );
      return Number(r[0]?.c ?? 0);
    })(),
    getAuthorSubscriptionIncome(authorId, monthStart, monthEnd),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM user_favorites
       INNER JOIN \`${itemsTable}\` AS mi ON mi.id = user_favorites.item_id
       WHERE mi.author_id = ?`,
      [authorId],
    ),
    pool
      .execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS c FROM notifications
       WHERE notifiable_id = ? AND notifiable_type LIKE ? AND type LIKE ?`,
        [authorId, "%User%", "%Badge%"],
      )
      .catch((): [RowDataPacket[], FieldPacket[]] => [[{ c: 0 } as RowDataPacket], []]),
    pool.execute<RowDataPacket[]>(
      `SELECT index_category_slug AS slug, COUNT(id) AS cnt
       FROM \`${itemsTable}\`
       WHERE author_id = ? AND access = 1
       GROUP BY index_category_slug`,
      [authorId],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(id) AS c FROM \`${itemsTable}\`
       WHERE author_id = ? AND access = 1
         AND created_at BETWEEN ? AND ?`,
      [authorId, toMysql(monthStart), toMysql(monthEnd)],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT query, section, slug, found, views
       FROM search_query_stats
       ORDER BY updated_at DESC
       LIMIT 5`,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT content FROM page_settings WHERE page = ? AND \`key\` = ? LIMIT 1`,
      ["contibutor", "announces"],
    ),
  ]);

  const balance = Number(userRes[0][0]?.balance ?? 0);
  const inFavorites = Number(favoritesRes[0][0]?.c ?? 0);
  const receivedBadges = Number(badgesRes[0][0]?.c ?? 0);
  const categoryChart: CategoryCount[] = catRes[0].map((row) => {
    const slug = String(row.slug ?? "");
    return {
      slug,
      label: indexCategoryLabel(slug),
      count: Number(row.cnt ?? 0),
    };
  });
  const itemsTotalPublished = categoryChart.reduce((s, c) => s + c.count, 0);
  const newItemsThisMonth = Number(newMonthRes[0][0]?.c ?? 0);

  let announces: unknown | null = null;
  const ar = announceRes[0][0]?.content;
  if (ar && typeof ar === "string") {
    try {
      announces = JSON.parse(ar);
    } catch {
      announces = ar;
    }
  }

  const popularSearchQueries: SearchQueryRow[] = searchRes[0].map((r) => ({
    query: String(r.query ?? ""),
    section: String(r.section ?? ""),
    slug: String(r.slug ?? ""),
    found: Number(r.found ?? 0),
    views: Number(r.views ?? 0),
  }));

  return {
    balance,
    inFavorites,
    receivedBadges,
    itemsTotalPublished,
    newItemsThisMonth,
    earnSales: { today: earnSalesToday, month: earnSalesMonth },
    earnAffiliate: { today: earnAffToday, month: earnAffMonth },
    earnSubscription: {
      todayCount: subTodayCount,
      month: subMonth,
    },
    popularSearchQueries,
    categoryChart,
    announces,
  };
}
