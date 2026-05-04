import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

export type CouponRow = {
  id: number;
  code: string;
  type: string;
  amount: number;
  status: number;
  uses: number;
  maxUses: number | null;
  startDate: string | null;
  endDate: string | null;
  comment: string | null;
};

export async function getCouponsForAuthor(authorId: number): Promise<CouponRow[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, code, type, amount, status, uses, max_uses, start_date, end_date, comment
     FROM coupon_services WHERE author_id = ?
     ORDER BY id DESC`,
    [authorId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    code: String(r.code ?? ""),
    type: String(r.type ?? ""),
    amount: Number(r.amount ?? 0),
    status: Number(r.status ?? 0),
    uses: Number(r.uses ?? 0),
    maxUses: r.max_uses == null ? null : Number(r.max_uses),
    startDate: r.start_date ? String(r.start_date) : null,
    endDate: r.end_date ? String(r.end_date) : null,
    comment: r.comment == null ? null : String(r.comment),
  }));
}

export type SearchQueryAdminRow = {
  query: string;
  section: string;
  slug: string;
  found: number;
  views: number;
  updatedAt: string;
};

const SEARCH_SORT_WHITELIST = new Set(["updated_at", "views", "found"]);

export async function getSearchQueriesForMarketing(
  limit = 30,
  sort: string = "updated_at",
): Promise<SearchQueryAdminRow[]> {
  const pool = getPool();
  const col = SEARCH_SORT_WHITELIST.has(sort) ? sort : "updated_at";
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT query, section, slug, found, views, updated_at
     FROM search_query_stats
     ORDER BY \`${col}\` DESC
     LIMIT ?`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map((r) => ({
    query: String(r.query ?? ""),
    section: String(r.section ?? ""),
    slug: String(r.slug ?? ""),
    found: Number(r.found ?? 0),
    views: Number(r.views ?? 0),
    updatedAt: r.updated_at ? String(r.updated_at) : "",
  }));
}

export type UpdateNotifyRow = {
  id: number;
  itemId: number;
  version: string | null;
  countBuyers: number;
  status: number;
  createdAt: string;
  itemName: string | null;
};

export async function createCoupon(input: {
  authorId: number;
  code: string;
  type: "value" | "percent" | "fixed";
  amount: number;
  maxUses: number | null;
  comment: string | null;
}): Promise<number> {
  const pool = getPool();
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO coupon_services
      (author_id, assigned_id, status, code, type, amount, start_date, end_date, uses, max_uses, priority, comment, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?, NULL, NULL, 0, ?, 0, ?, NOW(), NOW())`,
    [
      input.authorId,
      input.authorId,
      input.code,
      input.type,
      input.amount,
      input.maxUses,
      input.comment,
    ],
  );
  return Number(res.insertId);
}

export async function getUpdateNotificationsForAuthor(authorId: number): Promise<UpdateNotifyRow[]> {
  const pool = getPool();
  const table = marketplaceItemsTable();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT n.id, n.item_id, n.version, n.count_buyers, n.status, n.created_at, mi.name AS item_name
     FROM mailing_updates_notifies n
     LEFT JOIN \`${table}\` mi ON mi.id = n.item_id
     WHERE n.author_id = ?
     ORDER BY n.id DESC
     LIMIT 100`,
    [authorId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    itemId: Number(r.item_id),
    version: r.version == null ? null : String(r.version),
    countBuyers: Number(r.count_buyers ?? 0),
    status: Number(r.status ?? 0),
    createdAt: r.created_at ? String(r.created_at) : "",
    itemName: r.item_name == null ? null : String(r.item_name),
  }));
}
