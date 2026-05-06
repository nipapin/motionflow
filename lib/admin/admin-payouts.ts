import "server-only";
import type { RowDataPacket } from "mysql2";
import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import { getPool } from "@/lib/db";

export const ADMIN_PAYOUTS_PER_PAGE = 30;

export type AdminPayoutStatus = "awaiting" | "approved" | "cancelled" | "reserved" | "unavailable" | "any";
export type AdminPayoutPeriod = "current-month" | "previous-month-1" | "previous-month-2" | "previous-month-3";

export function parseAdminPayoutStatus(s: string | undefined): AdminPayoutStatus {
  if (
    s === "approved" ||
    s === "cancelled" ||
    s === "reserved" ||
    s === "unavailable" ||
    s === "any"
  )
    return s;
  return "awaiting";
}

export function parseAdminPayoutPeriod(s: string | undefined): AdminPayoutPeriod {
  if (s === "previous-month-1" || s === "previous-month-2" || s === "previous-month-3") return s;
  return "current-month";
}

function statusDb(s: AdminPayoutStatus): number | null {
  switch (s) {
    case "approved":
      return 1;
    case "cancelled":
      return -1;
    case "reserved":
      return -2;
    case "unavailable":
      return -3;
    case "any":
      return null;
    default:
      return 0;
  }
}

function toMysql(d: Date): string {
  return format(d, "yyyy-MM-dd HH:mm:ss");
}

export function periodRange(p: AdminPayoutPeriod): { start: Date; end: Date; label: string } {
  const now = new Date();
  switch (p) {
    case "previous-month-1": {
      const ref = subMonths(now, 1);
      return { start: startOfMonth(ref), end: endOfMonth(ref), label: format(ref, "MMM yyyy") };
    }
    case "previous-month-2": {
      const ref = subMonths(now, 2);
      return { start: startOfMonth(ref), end: endOfMonth(ref), label: format(ref, "MMM yyyy") };
    }
    case "previous-month-3": {
      const ref = subMonths(now, 3);
      return { start: startOfMonth(ref), end: endOfMonth(ref), label: format(ref, "MMM yyyy") };
    }
    default:
      return { start: startOfMonth(now), end: endOfMonth(now), label: "Current month" };
  }
}

export type AdminPayoutRow = {
  id: number;
  recipient_id: number;
  recipient_name: string | null;
  recipient_email: string | null;
  status: number;
  amount: number;
  sold_amount: number;
  subs_amount: number;
  subs_bonus: number | null;
  method: string | null;
  extra_json: string | null;
  withdraw_account: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminPayoutsList = {
  rows: AdminPayoutRow[];
  total: number;
  counts: Record<AdminPayoutStatus, number>;
};

export async function getAdminPayouts(
  status: AdminPayoutStatus,
  period: AdminPayoutPeriod,
  page: number,
): Promise<AdminPayoutsList> {
  const pool = getPool();
  const range = periodRange(period);
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * ADMIN_PAYOUTS_PER_PAGE;

  const dbStatus = statusDb(status);

  const where: string[] = ["p.created_at BETWEEN ? AND ?"];
  const params: (string | number)[] = [toMysql(range.start), toMysql(range.end)];
  if (dbStatus !== null) {
    where.push("p.status = ?");
    params.push(dbStatus);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const [
    countRows,
    listRows,
    countsRows,
  ] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM payouts p ${whereSql}`,
      params,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT p.id, p.recipient_id, p.status, p.amount, p.sold_amount, p.subs_amount, p.subs_bonus,
              p.method, p.extra_json, p.created_at, p.updated_at,
              u.name AS recipient_name, u.email AS recipient_email, u.withdraw_account
         FROM payouts p
         LEFT JOIN users u ON u.id = p.recipient_id
         ${whereSql}
         ORDER BY p.created_at DESC
         LIMIT ${ADMIN_PAYOUTS_PER_PAGE} OFFSET ${offset}`,
      params,
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT status, COUNT(*) AS c FROM payouts p
        WHERE p.created_at BETWEEN ? AND ?
        GROUP BY status`,
      [toMysql(range.start), toMysql(range.end)],
    ),
  ]);

  const total = Number(countRows[0][0]?.c ?? 0);
  const rows: AdminPayoutRow[] = listRows[0].map((r) => ({
    id: Number(r.id),
    recipient_id: Number(r.recipient_id ?? 0),
    recipient_name: r.recipient_name == null ? null : String(r.recipient_name),
    recipient_email: r.recipient_email == null ? null : String(r.recipient_email),
    status: Number(r.status ?? 0),
    amount: Number(r.amount ?? 0),
    sold_amount: Number(r.sold_amount ?? 0),
    subs_amount: Number(r.subs_amount ?? 0),
    subs_bonus: r.subs_bonus == null ? null : Number(r.subs_bonus),
    method: r.method == null ? null : String(r.method),
    extra_json: r.extra_json == null ? null : String(r.extra_json),
    withdraw_account: r.withdraw_account == null ? null : String(r.withdraw_account),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
  }));

  const countMap = new Map<number, number>();
  for (const c of countsRows[0]) {
    countMap.set(Number(c.status), Number(c.c ?? 0));
  }

  const counts: Record<AdminPayoutStatus, number> = {
    awaiting: countMap.get(0) ?? 0,
    approved: countMap.get(1) ?? 0,
    cancelled: countMap.get(-1) ?? 0,
    reserved: countMap.get(-2) ?? 0,
    unavailable: countMap.get(-3) ?? 0,
    any: Array.from(countMap.values()).reduce((a, b) => a + b, 0),
  };

  return { rows, total, counts };
}

export const PAYOUT_STATUS_META: Record<AdminPayoutStatus, { title: string; description: string; tone: "default" | "success" | "warning" | "destructive" | "muted" }> = {
  awaiting: { title: "Awaiting", description: "Queued, ready for approval", tone: "warning" },
  approved: { title: "Approved", description: "Marked as paid", tone: "success" },
  cancelled: { title: "Cancelled", description: "Returned / refused", tone: "destructive" },
  reserved: { title: "Reserved", description: "Returned to user balance", tone: "muted" },
  unavailable: { title: "Unavailable", description: "Disabled by system", tone: "muted" },
  any: { title: "Any", description: "All payouts in window", tone: "default" },
};
