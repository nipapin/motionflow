import "server-only";
import type { RowDataPacket } from "mysql2";
import { format } from "date-fns";
import { getPool } from "@/lib/db";

export const ADMIN_AFFILIATE_PER_PAGE = 30;

export type AdminAffiliateLinkRow = {
  id: number;
  link: string;
  bind_id: number;
  bind_name: string | null;
  redirect: string;
  comment: string | null;
  views: number;
  tag_tracking: string | null;
  ref_earn_sum: number;
  sold_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_date: string;
};

export type AdminAffiliateSummary = {
  rows: AdminAffiliateLinkRow[];
  total: number;
  totals: {
    earned: number;
    sold_count: number;
    clicks: number;
    links_total: number;
    links_active: number;
  };
};

function fmtDate(s: unknown): string {
  if (!s) return "—";
  try {
    return format(new Date(String(s)), "dd.MM.yyyy");
  } catch {
    return String(s);
  }
}

export type AdminAffiliateSort = "last-created" | "last-activity" | "max-clicks" | "max-earnings";

export function parseAffiliateSort(s: string | undefined): AdminAffiliateSort {
  if (s === "last-activity" || s === "max-clicks" || s === "max-earnings") return s;
  return "last-created";
}

function sortColumn(s: AdminAffiliateSort): string {
  switch (s) {
    case "last-activity":
      return "sl.updated_at";
    case "max-clicks":
      return "sl.views";
    case "max-earnings":
      return "ref_earn_sum";
    default:
      return "sl.created_at";
  }
}

export async function getAffiliateAdminPage(
  page: number,
  sort: AdminAffiliateSort,
): Promise<AdminAffiliateSummary> {
  const pool = getPool();
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * ADMIN_AFFILIATE_PER_PAGE;
  const orderCol = sortColumn(sort);

  const [
    countRows,
    listRows,
    totalsRows,
    activeRows,
  ] = await Promise.all([
    pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM short_links sl WHERE sl.deleted_at IS NULL`),
    pool.execute<RowDataPacket[]>(
      `SELECT sl.id, sl.link, sl.bind_id, sl.redirect, sl.comment, sl.views,
              sl.arguments, sl.created_at, sl.updated_at, sl.deleted_at,
              u.name AS bind_name,
              (SELECT COALESCE(SUM(ref_earn), 0) FROM sold_items WHERE ref_user_id = sl.bind_id AND status = 1) AS ref_earn_sum,
              (SELECT COUNT(*) FROM sold_items WHERE ref_user_id = sl.bind_id AND status = 1) AS sold_count
         FROM short_links sl
         LEFT JOIN users u ON u.id = sl.bind_id
         WHERE sl.deleted_at IS NULL
         ORDER BY ${orderCol} DESC
         LIMIT ${ADMIN_AFFILIATE_PER_PAGE} OFFSET ${offset}`,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT
         COALESCE(SUM(views), 0) AS clicks,
         COUNT(*) AS links_total
        FROM short_links WHERE deleted_at IS NULL`,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT
         (SELECT COALESCE(SUM(ref_earn), 0) FROM sold_items WHERE status = 1) AS earned,
         (SELECT COUNT(*) FROM sold_items WHERE status = 1 AND ref_user_id IS NOT NULL) AS sold_count,
         (SELECT COUNT(DISTINCT bind_id) FROM short_links WHERE deleted_at IS NULL) AS links_active`,
    ),
  ]);

  const total = Number(countRows[0][0]?.c ?? 0);
  const rows: AdminAffiliateLinkRow[] = listRows[0].map((r) => {
    let tagTracking: string | null = null;
    if (r.arguments) {
      try {
        const parsed = JSON.parse(String(r.arguments)) as { tag_tracking?: unknown };
        if (parsed && typeof parsed.tag_tracking === "string") tagTracking = parsed.tag_tracking;
      } catch {
        /* ignore */
      }
    }
    return {
      id: Number(r.id),
      link: String(r.link ?? ""),
      bind_id: Number(r.bind_id ?? 0),
      bind_name: r.bind_name == null ? null : String(r.bind_name),
      redirect: String(r.redirect ?? ""),
      comment: r.comment == null ? null : String(r.comment),
      views: Number(r.views ?? 0),
      tag_tracking: tagTracking,
      ref_earn_sum: Number(r.ref_earn_sum ?? 0),
      sold_count: Number(r.sold_count ?? 0),
      created_at: r.created_at ? String(r.created_at) : "",
      updated_at: r.updated_at ? String(r.updated_at) : "",
      deleted_at: r.deleted_at == null ? null : String(r.deleted_at),
      created_date: fmtDate(r.created_at),
    };
  });

  return {
    rows,
    total,
    totals: {
      earned: Number(activeRows[0][0]?.earned ?? 0),
      sold_count: Number(activeRows[0][0]?.sold_count ?? 0),
      clicks: Number(totalsRows[0][0]?.clicks ?? 0),
      links_total: Number(totalsRows[0][0]?.links_total ?? 0),
      links_active: Number(activeRows[0][0]?.links_active ?? 0),
    },
  };
}
