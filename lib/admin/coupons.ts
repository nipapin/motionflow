import "server-only";
import type { RowDataPacket } from "mysql2";
import { format } from "date-fns";
import { getPool } from "@/lib/db";

export const ADMIN_COUPONS_PER_PAGE = 30;

export type CouponRow = {
  id: number;
  author_id: number;
  author_name: string | null;
  assigned_id: number;
  status: number;
  code: string;
  type: string;
  amount: number;
  start_date: string | null;
  end_date: string | null;
  uses: number;
  max_uses: number | null;
  priority: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  created_date: string;
};

export type AdminCouponSort = "latest" | "most-used" | "last-activity";

export function parseCouponSort(s: string | undefined): AdminCouponSort {
  if (s === "most-used" || s === "last-activity") return s;
  return "latest";
}

function couponSortColumn(s: AdminCouponSort): string {
  switch (s) {
    case "most-used":
      return "uses";
    case "last-activity":
      return "updated_at";
    default:
      return "created_at";
  }
}

function fmtDate(s: unknown): string {
  if (!s) return "—";
  try {
    return format(new Date(String(s)), "dd.MM.yyyy");
  } catch {
    return String(s);
  }
}

export type AdminCouponList = {
  rows: CouponRow[];
  total: number;
};

export async function getCouponsAdminPage(
  page: number,
  sort: AdminCouponSort,
  filter?: { search?: string; onlyActive?: boolean },
): Promise<AdminCouponList> {
  const pool = getPool();
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * ADMIN_COUPONS_PER_PAGE;
  const orderCol = couponSortColumn(sort);

  const where: string[] = ["c.deleted_at IS NULL"];
  const params: (string | number)[] = [];

  if (filter?.search && filter.search.trim()) {
    where.push("(c.code LIKE ? OR c.comment LIKE ?)");
    const like = `%${filter.search.trim()}%`;
    params.push(like, like);
  }
  if (filter?.onlyActive) {
    where.push("c.status = 1");
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM coupon_services c ${whereSql}`,
    params,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.id, c.author_id, c.assigned_id, c.status, c.code, c.type, c.amount,
            c.start_date, c.end_date, c.uses, c.max_uses, c.priority, c.comment,
            c.created_at, c.updated_at,
            u.name AS author_name
       FROM coupon_services c
       LEFT JOIN users u ON u.id = c.author_id
       ${whereSql}
       ORDER BY c.${orderCol} DESC
       LIMIT ${ADMIN_COUPONS_PER_PAGE} OFFSET ${offset}`,
    params,
  );

  const out: CouponRow[] = rows.map((r) => ({
    id: Number(r.id),
    author_id: Number(r.author_id ?? 0),
    author_name: r.author_name == null ? null : String(r.author_name),
    assigned_id: Number(r.assigned_id ?? 0),
    status: Number(r.status ?? 0),
    code: String(r.code ?? ""),
    type: String(r.type ?? "value"),
    amount: Number(r.amount ?? 0),
    start_date: r.start_date == null ? null : String(r.start_date),
    end_date: r.end_date == null ? null : String(r.end_date),
    uses: Number(r.uses ?? 0),
    max_uses: r.max_uses == null ? null : Number(r.max_uses),
    priority: Number(r.priority ?? 0),
    comment: r.comment == null ? null : String(r.comment),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at),
  }));

  return { rows: out, total };
}

export async function getCouponById(id: number): Promise<CouponRow | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.id, c.author_id, c.assigned_id, c.status, c.code, c.type, c.amount,
            c.start_date, c.end_date, c.uses, c.max_uses, c.priority, c.comment,
            c.created_at, c.updated_at,
            u.name AS author_name
       FROM coupon_services c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.id = ? AND c.deleted_at IS NULL LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    author_id: Number(r.author_id ?? 0),
    author_name: r.author_name == null ? null : String(r.author_name),
    assigned_id: Number(r.assigned_id ?? 0),
    status: Number(r.status ?? 0),
    code: String(r.code ?? ""),
    type: String(r.type ?? "value"),
    amount: Number(r.amount ?? 0),
    start_date: r.start_date == null ? null : String(r.start_date),
    end_date: r.end_date == null ? null : String(r.end_date),
    uses: Number(r.uses ?? 0),
    max_uses: r.max_uses == null ? null : Number(r.max_uses),
    priority: Number(r.priority ?? 0),
    comment: r.comment == null ? null : String(r.comment),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at),
  };
}

export async function couponCodeExists(code: string, excludeId?: number): Promise<boolean> {
  const pool = getPool();
  if (excludeId) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM coupon_services WHERE code = ? AND id <> ? LIMIT 1`,
      [code, excludeId],
    );
    return rows.length > 0;
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM coupon_services WHERE code = ? LIMIT 1`,
    [code],
  );
  return rows.length > 0;
}
