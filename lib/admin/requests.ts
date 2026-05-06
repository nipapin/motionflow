import "server-only";
import type { RowDataPacket } from "mysql2";
import type { SqlParams } from "@/lib/author/sql-params";
import { formatDistanceToNow } from "date-fns";
import { getPool } from "@/lib/db";

export type RequestSortKey =
  | "assigned"
  | "all"
  | "business"
  | "support"
  | "become_author"
  | "become_affiliate"
  | "bug_report";

export type AdminRequestRow = {
  id: number;
  type: string;
  type_label: string;
  answered: string | null;
  expect_resolve: boolean | null;
  user_id: number | null;
  assigned_staff_id: number | null;
  answered_staff_id: number | null;
  created_at: Date;
  updated_at: Date;
  attachments: string | null;
  assigned_staff_name: string | null;
  answered_staff_name: string | null;
  /** ISO string for client if needed */
  created_label: string;
  wait_label: string;
};

const PER_PAGE = 12;

function sortToFilter(
  sort: RequestSortKey,
  staffId: number,
): { where: string; params: SqlParams } {
  switch (sort) {
    case "assigned":
      return { where: "rm.answered IS NULL AND rm.assigned_staff_id = ?", params: [staffId] };
    case "all":
      return { where: "rm.answered IS NULL", params: [] };
    case "business":
      return { where: "rm.answered IS NULL AND rm.type = ?", params: ["business_contact"] };
    case "support":
      return { where: "rm.answered IS NULL AND rm.type = ?", params: ["support_contact"] };
    case "become_author":
      return { where: "rm.answered IS NULL AND rm.type = ?", params: ["become_author_request"] };
    case "become_affiliate":
      return { where: "rm.answered IS NULL AND rm.type = ?", params: ["become_affiliate_request"] };
    case "bug_report":
      return { where: "rm.answered IS NULL AND rm.type = ?", params: ["bug_report"] };
    default:
      return sortToFilter("assigned", staffId);
  }
}

function headlineType(type: string): string {
  return type
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function getOpenRequestCounts(): Promise<Record<string, number>> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT type, COUNT(*) AS c FROM request_messages WHERE answered IS NULL GROUP BY type`,
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[String(r.type)] = Number(r.c ?? 0);
  }
  return out;
}

export async function getAssignedToMeOpenCount(staffId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM request_messages WHERE answered IS NULL AND assigned_staff_id = ?`,
    [staffId],
  );
  return Number(rows[0]?.c ?? 0);
}

export function parseRequestSort(raw: string | undefined): RequestSortKey {
  const allowed: RequestSortKey[] = [
    "assigned",
    "all",
    "business",
    "support",
    "become_author",
    "become_affiliate",
    "bug_report",
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as RequestSortKey;
  return "assigned";
}

/** Map legacy path segment → sort key (optional). */
export function requestSortFromSegment(seg: string | undefined): RequestSortKey | null {
  if (!seg) return null;
  const map: Record<string, RequestSortKey> = {
    assigned: "assigned",
    all: "all",
    business: "business",
    support: "support",
    become_author: "become_author",
    become_affiliate: "become_affiliate",
    bug_report: "bug_report",
    business_contact: "business",
    support_contact: "support",
    become_author_request: "become_author",
    become_affiliate_request: "become_affiliate",
  };
  return map[seg] ?? null;
}

export async function getRequestsPage(
  sort: RequestSortKey,
  staffId: number,
  page: number,
): Promise<{ rows: AdminRequestRow[]; total: number }> {
  const pool = getPool();
  const { where, params } = sortToFilter(sort, staffId);
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * PER_PAGE;

  const countSql = `SELECT COUNT(*) AS c FROM request_messages rm WHERE ${where}`;
  const [countRows] = await pool.execute<RowDataPacket[]>(countSql, params);
  const total = Number(countRows[0]?.c ?? 0);

  const listSql = `
    SELECT rm.*,
      (SELECT name FROM users WHERE id = rm.answered_staff_id) AS answered_staff_name,
      (SELECT name FROM users WHERE id = rm.assigned_staff_id) AS assigned_staff_name
    FROM request_messages rm
    WHERE ${where}
    ORDER BY rm.created_at DESC
    LIMIT ${PER_PAGE} OFFSET ${offset}
  `;
  const [rows] = await pool.execute<RowDataPacket[]>(listSql, params);

  const mapped: AdminRequestRow[] = rows.map((r) => {
    const created = new Date(String(r.created_at));
    const updated = new Date(String(r.updated_at));
    const now = new Date();
    const waitingRef = r.expect_resolve ? updated : created;
    const wait_label = r.answered
      ? ""
      : formatDistanceToNow(waitingRef, { addSuffix: true });

    return {
      id: Number(r.id),
      type: String(r.type ?? ""),
      type_label: headlineType(String(r.type ?? "")),
      answered: r.answered == null ? null : String(r.answered),
      expect_resolve: r.expect_resolve == null ? null : Boolean(Number(r.expect_resolve)),
      user_id: r.user_id == null ? null : Number(r.user_id),
      assigned_staff_id: r.assigned_staff_id == null ? null : Number(r.assigned_staff_id),
      answered_staff_id: r.answered_staff_id == null ? null : Number(r.answered_staff_id),
      created_at: created,
      updated_at: updated,
      attachments: r.attachments == null ? null : String(r.attachments),
      assigned_staff_name: r.assigned_staff_name == null ? null : String(r.assigned_staff_name),
      answered_staff_name: r.answered_staff_name == null ? null : String(r.answered_staff_name),
      created_label: created.toLocaleString(),
      wait_label: wait_label,
    };
  });

  return { rows: mapped, total };
}

export type AdminRequestDetail = AdminRequestRow & {
  content_json: string | null;
  pc_info: string | null;
  user_name: string | null;
};

export async function getRequestById(id: number): Promise<AdminRequestDetail | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT rm.*,
      u.name AS user_name,
      (SELECT name FROM users WHERE id = rm.answered_staff_id) AS answered_staff_name,
      (SELECT name FROM users WHERE id = rm.assigned_staff_id) AS assigned_staff_name
     FROM request_messages rm
     LEFT JOIN users u ON u.id = rm.user_id
     WHERE rm.id = ?
     LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const created = new Date(String(r.created_at));
  const updated = new Date(String(r.updated_at));
  const waitingRef = r.expect_resolve ? updated : created;
  const wait_label = r.answered ? "" : formatDistanceToNow(waitingRef, { addSuffix: true });

  return {
    id: Number(r.id),
    type: String(r.type ?? ""),
    type_label: headlineType(String(r.type ?? "")),
    answered: r.answered == null ? null : String(r.answered),
    expect_resolve: r.expect_resolve == null ? null : Boolean(Number(r.expect_resolve)),
    user_id: r.user_id == null ? null : Number(r.user_id),
    assigned_staff_id: r.assigned_staff_id == null ? null : Number(r.assigned_staff_id),
    answered_staff_id: r.answered_staff_id == null ? null : Number(r.answered_staff_id),
    created_at: created,
    updated_at: updated,
    attachments: r.attachments == null ? null : String(r.attachments),
    assigned_staff_name: r.assigned_staff_name == null ? null : String(r.assigned_staff_name),
    answered_staff_name: r.answered_staff_name == null ? null : String(r.answered_staff_name),
    created_label: created.toLocaleString(),
    wait_label,
    content_json: r.content_json == null ? null : String(r.content_json),
    pc_info: r.pc_info == null ? null : String(r.pc_info),
    user_name: r.user_name == null ? null : String(r.user_name),
  };
}

export { PER_PAGE as REQUESTS_PER_PAGE };
