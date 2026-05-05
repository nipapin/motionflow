import "server-only";
import type { RowDataPacket } from "mysql2";
import type { SqlParams } from "@/lib/author/sql-params";
import {
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import { motionflowItemPageUrl } from "@/lib/motionflow-urls";
import type { Product } from "@/lib/product-types";

function toMysql(d: Date): string {
  return format(d, "yyyy-MM-dd HH:mm:ss");
}

export type EarningsPeriodKey =
  | "current-month"
  | "previous-month-1"
  | "previous-month-2"
  | "previous-month-3"
  | "all-time"
  | "today"
  | "yesterday"
  | "this-week"
  | "last-7-days"
  | "last-30-days"
  | "last-60-days"
  | "last-90-days"
  | "this-year"
  | "last-year";

export function resolvePeriodRange(
  key: EarningsPeriodKey,
  customFrom?: string | null,
  customTo?: string | null,
): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (key === "all-time") return { from: null, to: null };
  if (key === "current-month") return { from: startOfMonth(now), to: endOfMonth(now) };
  if (key === "previous-month-1") {
    const d = subMonths(now, 1);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }
  if (key === "previous-month-2") {
    const d = subMonths(now, 2);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }
  if (key === "previous-month-3") {
    const d = subMonths(now, 3);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  }
  if (key === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (key === "yesterday") {
    const y = subDays(startOfDay(now), 1);
    return { from: y, to: endOfDay(y) };
  }
  if (key === "this-week") {
    const dow = now.getDay();
    const diff = (dow + 6) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return { from: start, to: endOfDay(now) };
  }
  if (key === "last-7-days") return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
  if (key === "last-30-days") return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
  if (key === "last-60-days") return { from: startOfDay(subDays(now, 60)), to: endOfDay(now) };
  if (key === "last-90-days") return { from: startOfDay(subDays(now, 90)), to: endOfDay(now) };
  if (key === "this-year") return { from: startOfYear(now), to: endOfDay(now) };
  if (key === "last-year") {
    const start = new Date(now.getFullYear() - 1, 0, 1);
    const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    return { from: start, to: end };
  }
  if (customFrom && customTo) {
    const f = new Date(customFrom);
    const t = new Date(customTo);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime())) {
      return { from: startOfDay(f), to: endOfDay(t) };
    }
  }
  return { from: startOfMonth(now), to: endOfMonth(now) };
}

export function licenseTitle(_categorySlug: string, license: number): string {
  if (license <= 1) return "Personal License";
  if (license === 2) return "Commercial License";
  return `License #${license}`;
}

export type DirectSaleRow = {
  id: number;
  status: number;
  itemName: string;
  itemId: number;
  buyerName: string;
  soldPrice: number;
  license: number;
  licenseTitle: string;
  qty: number;
  authorEarn: number;
  coEarn: number | null;
  refEarn: number | null;
  coAuthorId: number | null;
  authorId: number;
  refAuthorId: number | null;
  refLinkId: number | null;
  systemTax: number;
  soldNet: number;
  createdAt: string;
  itemUrl: string;
  /** UI classification */
  rowKind: "direct" | "team_primary" | "team_co" | "affiliate_ref" | "refund" | "cancelled" | "waiting";
};

function rowKindFor(r: DirectSaleRow, viewerId: number): DirectSaleRow["rowKind"] {
  if (r.status !== 1) {
    if (r.status === 0) return "refund";
    if (r.status === -1) return "cancelled";
    if (r.status === -2) return "waiting";
    return "cancelled";
  }
  if (r.refAuthorId === viewerId && r.authorId !== viewerId) return "affiliate_ref";
  if (r.coAuthorId && r.coAuthorId !== viewerId && r.authorId === viewerId) return "team_primary";
  if (r.coAuthorId === viewerId && r.authorId !== viewerId) return "team_co";
  return "direct";
}

export async function getDirectSalesRows(
  authorId: number,
  {
    from,
    to,
    page = 1,
    perPage = 20,
  }: { from: Date | null; to: Date | null; page?: number; perPage?: number },
): Promise<{ rows: DirectSaleRow[]; total: number }> {
  const pool = getPool();
  const table = marketplaceItemsTable();
  const offset = Math.max(0, (page - 1) * perPage);
  const limit = Math.min(Math.max(perPage, 1), 50);

  let where = `(si.author_id = ? OR si.co_author_id = ? OR si.ref_author_id = ?)`;
  const params: SqlParams = [authorId, authorId, authorId];
  if (from && to) {
    where += ` AND si.created_at BETWEEN ? AND ?`;
    params.push(toMysql(from), toMysql(to));
  }

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM sold_items si WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [dataRows] = await pool.execute<RowDataPacket[]>(
    `SELECT si.*, mi.name AS item_name, mi.id AS origin_id, mi.index_category_slug,
      (SELECT u.name FROM users u WHERE u.id = si.buyer_id LIMIT 1) AS buyer_name
     FROM sold_items si
     INNER JOIN \`${table}\` mi ON mi.id = si.item_id
     WHERE ${where}
     ORDER BY si.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  const rows: DirectSaleRow[] = dataRows.map((raw) => {
    const itemName = String(raw.item_name ?? "");
    const itemId = Number(raw.origin_id ?? raw.item_id);
    const stub: Product = {
      id: itemId,
      author_id: Number(raw.author_id),
      access: 1,
      price: 0,
      team: null,
      exclusive: 0,
      subscription: 0,
      index_category_slug: String(raw.index_category_slug ?? ""),
      sub_category_slug: "",
      name: itemName,
      description: "",
      description_html: null,
      description_json: {},
      tags: "",
      has_qty: 0,
      attributes: {},
      extra: null,
      json_args: null,
      files: {},
      has_demo: null,
      demo_url: null,
      has_external: null,
      external_domain: null,
      external_url: null,
      youtube_preview: null,
      discount_price: null,
      discount_start: null,
      discount_end: null,
      created_at: "",
      updated_at: "",
    };
    const license = Number(raw.license ?? 0);
    const r: DirectSaleRow = {
      id: Number(raw.id),
      status: Number(raw.status),
      itemName,
      itemId,
      buyerName: String(raw.buyer_name ?? ""),
      soldPrice: Number(raw.sold_price ?? 0),
      license,
      licenseTitle: licenseTitle(String(raw.index_category_slug ?? ""), license),
      qty: Number(raw.qty ?? 1),
      authorEarn: Number(raw.author_earn ?? 0),
      coEarn: raw.co_earn == null ? null : Number(raw.co_earn),
      refEarn: raw.ref_earn == null ? null : Number(raw.ref_earn),
      coAuthorId: raw.co_author_id == null ? null : Number(raw.co_author_id),
      authorId: Number(raw.author_id),
      refAuthorId: raw.ref_author_id == null ? null : Number(raw.ref_author_id),
      refLinkId: raw.ref_link_id == null ? null : Number(raw.ref_link_id),
      systemTax: Number(raw.system_tax ?? 0),
      soldNet: Number(raw.sold_net ?? 0),
      createdAt: raw.created_at ? String(raw.created_at) : "",
      itemUrl: motionflowItemPageUrl(stub, itemId, itemName),
      rowKind: "direct",
    };
    r.rowKind = rowKindFor(r, authorId);
    return r;
  });

  return { rows, total };
}

export async function getSalesPeriodSummary(
  authorId: number,
  from: Date | null,
  to: Date | null,
): Promise<{ salesEarned: number; salesCount: number; affiliateEarned: number; affiliateCount: number; refunds: number; refundCount: number }> {
  const pool = getPool();
  const dateSql =
    from && to ? `AND sold_items.created_at BETWEEN ? AND ?` : "";
  const salesParams: SqlParams = [authorId, authorId, authorId];
  if (from && to) {
    salesParams.push(toMysql(from), toMysql(to));
  }

  const [sales] = await pool.execute<RowDataPacket[]>(
    `SELECT
      COALESCE(SUM(IF(sold_items.co_author_id = ?, sold_items.co_earn, sold_items.author_earn)), 0) AS earned,
      COUNT(sold_items.id) AS c
     FROM sold_items
     WHERE (sold_items.author_id = ? OR sold_items.co_author_id = ?)
       AND sold_items.status = 1
       ${dateSql}`,
    salesParams,
  );

  const refParams: SqlParams = from && to ? [authorId, toMysql(from), toMysql(to)] : [authorId];
  const [refs] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(sold_items.ref_earn), 0) AS earned, COUNT(sold_items.id) AS c
     FROM short_links
     LEFT JOIN sold_items ON sold_items.ref_link_id = short_links.id AND sold_items.status = 1
     WHERE short_links.bind_id = ?
       ${from && to ? "AND sold_items.created_at BETWEEN ? AND ?" : ""}`,
    refParams,
  );

  let refundSql = `SELECT
      COALESCE(SUM(IF(sold_items.co_author_id = ?, sold_items.co_earn, sold_items.author_earn)), 0) AS refunded,
      COUNT(sold_items.id) AS c
     FROM sold_items
     WHERE (sold_items.author_id = ? OR sold_items.co_author_id = ?)
       AND sold_items.status != 1`;
  const refundParams: SqlParams = [authorId, authorId, authorId];
  if (from && to) {
    refundSql += ` AND sold_items.updated_at BETWEEN ? AND ?`;
    refundParams.push(toMysql(from), toMysql(to));
  }
  const [refunds] = await pool.execute<RowDataPacket[]>(refundSql, refundParams);

  return {
    salesEarned: Number(sales[0]?.earned ?? 0),
    salesCount: Number(sales[0]?.c ?? 0),
    affiliateEarned: Number(refs[0]?.earned ?? 0),
    affiliateCount: Number(refs[0]?.c ?? 0),
    refunds: Number(refunds[0]?.refunded ?? 0),
    refundCount: Number(refunds[0]?.c ?? 0),
  };
}

export type SubscriptionDownloadAgg = {
  name: string;
  originId: number;
  count: number;
};

export async function getTotalSubscriptionDownloadCount(
  authorId: number,
  from: Date | null,
  to: Date | null,
): Promise<number> {
  const pool = getPool();
  let sql = `SELECT COUNT(*) AS c FROM subscription_downloads WHERE author_id = ?`;
  const params: SqlParams = [authorId];
  if (from && to) {
    sql += ` AND created_at BETWEEN ? AND ?`;
    params.push(toMysql(from), toMysql(to));
  }
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return Number(rows[0]?.c ?? 0);
}

export async function getSubscriptionDownloadAggregates(
  authorId: number,
  from: Date | null,
  to: Date | null,
  { page = 1, perPage = 20 }: { page?: number; perPage?: number } = {},
): Promise<{ rows: SubscriptionDownloadAgg[]; total: number }> {
  const pool = getPool();
  const table = marketplaceItemsTable();
  const offset = Math.max(0, (page - 1) * perPage);
  const limit = Math.min(Math.max(perPage, 1), 50);

  let where = `sd.author_id = ?`;
  const params: SqlParams = [authorId];
  if (from && to) {
    where += ` AND sd.created_at BETWEEN ? AND ?`;
    params.push(toMysql(from), toMysql(to));
  }

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM (
       SELECT mi.id
       FROM subscription_downloads sd
       INNER JOIN \`${table}\` mi ON mi.id = sd.item_id
       WHERE ${where}
       GROUP BY mi.id, mi.name
     ) t`,
    params,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT mi.name AS item_name, mi.id AS origin_id, COUNT(sd.id) AS cnt
     FROM subscription_downloads sd
     INNER JOIN \`${table}\` mi ON mi.id = sd.item_id
     WHERE ${where}
     GROUP BY mi.id, mi.name
     ORDER BY cnt DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return {
    rows: rows.map((r) => ({
      name: String(r.item_name ?? ""),
      originId: Number(r.origin_id),
      count: Number(r.cnt ?? 0),
    })),
    total,
  };
}

export type SubscriberRow = {
  id: number;
  buyerName: string;
  plan: string;
  amount: number;
  createdAt: string;
  endsAt: string | null;
};

export async function getSubscriberRows(
  authorId: number,
  from: Date | null,
  to: Date | null,
  { page = 1, perPage = 24 }: { page?: number; perPage?: number } = {},
): Promise<{ rows: SubscriberRow[]; total: number }> {
  const pool = getPool();
  const offset = Math.max(0, (page - 1) * perPage);
  const limit = Math.min(Math.max(perPage, 1), 50);

  let where = `ss.author_id = ?`;
  const params: SqlParams = [authorId];
  if (from && to) {
    where += ` AND ss.created_at BETWEEN ? AND ?`;
    params.push(toMysql(from), toMysql(to));
  }

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM subscription_systems ss WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ss.id, ss.plan, ss.amount, ss.created_at, ss.ends_at, u.name AS buyer_name
     FROM subscription_systems ss
     INNER JOIN users u ON u.id = ss.buyer_id
     WHERE ${where}
     ORDER BY ss.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  return {
    rows: rows.map((r) => ({
      id: Number(r.id),
      buyerName: String(r.buyer_name ?? ""),
      plan: String(r.plan ?? ""),
      amount: Number(r.amount ?? 0),
      createdAt: r.created_at ? String(r.created_at) : "",
      endsAt: r.ends_at ? String(r.ends_at) : null,
    })),
    total,
  };
}

export async function getSubscriptionTotalsFromPayouts(
  authorId: number,
  from: Date | null,
  to: Date | null,
): Promise<{ subsAmount: number; subsBonus: number }> {
  const pool = getPool();
  let sql =
    "SELECT COALESCE(SUM(subs_amount),0) AS subs, COALESCE(SUM(subs_bonus),0) AS bonus FROM payouts WHERE recipient_id = ?";
  const params: SqlParams = [authorId];
  if (from && to) {
    sql += " AND created_at BETWEEN ? AND ?";
    params.push(toMysql(from), toMysql(to));
  }
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return {
    subsAmount: Number(rows[0]?.subs ?? 0),
    subsBonus: Number(rows[0]?.bonus ?? 0),
  };
}

export async function getSubscriberPlanPie(authorId: number): Promise<{ plan: string; count: number }[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT plan, COUNT(id) AS c FROM subscription_systems WHERE author_id = ? GROUP BY plan ORDER BY plan`,
    [authorId],
  );
  return rows.map((r) => ({ plan: String(r.plan ?? ""), count: Number(r.c ?? 0) }));
}
