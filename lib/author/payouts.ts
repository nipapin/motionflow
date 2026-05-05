import "server-only";
import type { RowDataPacket } from "mysql2";
import { format } from "date-fns";
import { getPool } from "@/lib/db";

export type PayoutRow = {
  id: number;
  status: number;
  amount: number;
  soldAmount: number;
  subsAmount: number;
  subsBonus: number | null;
  method: string | null;
  extraJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export function payoutStatusLabel(status: number): { label: string; tone: "default" | "success" } {
  if (status === 0) return { label: "Awaiting", tone: "default" };
  if (status === 1) return { label: "Successfully", tone: "success" };
  return { label: `Status ${status}`, tone: "default" };
}

/** Next payout display date (Laravel Payouts@index logic). */
export function nextScheduledPayoutDate(now = new Date()): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = now.getDate();
  const fourteenth = new Date(y, m, 14, 23, 59, 59);
  if (now <= fourteenth) {
    return new Date(y, m, 15, 12, 0, 0);
  }
  return new Date(y, m + 1, 15, 12, 0, 0);
}

export async function getAwaitingPayoutSum(recipientId: number): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM payouts WHERE recipient_id = ? AND status = 0`,
    [recipientId],
  );
  return Number(rows[0]?.s ?? 0);
}

export async function getPayoutsPage(
  recipientId: number,
  { page = 1, perPage = 20 }: { page?: number; perPage?: number } = {},
): Promise<{ rows: PayoutRow[]; total: number }> {
  const pool = getPool();
  const offset = Math.max(0, (page - 1) * perPage);
  const limit = Math.min(Math.max(perPage, 1), 50);

  const [[countRows], [dataRows]] = await Promise.all([
    pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM payouts WHERE recipient_id = ?`,
      [recipientId],
    ),
    pool.execute<RowDataPacket[]>(
      `SELECT id, status, amount, sold_amount, subs_amount, subs_bonus, method, extra_json, created_at, updated_at
       FROM payouts WHERE recipient_id = ?
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [recipientId],
    ),
  ]);

  const total = Number(countRows[0]?.c ?? 0);
  const rows: PayoutRow[] = dataRows.map((r) => ({
    id: Number(r.id),
    status: Number(r.status),
    amount: Number(r.amount ?? 0),
    soldAmount: Number(r.sold_amount ?? 0),
    subsAmount: Number(r.subs_amount ?? 0),
    subsBonus: r.subs_bonus == null ? null : Number(r.subs_bonus),
    method: r.method == null ? null : String(r.method),
    extraJson: r.extra_json == null ? null : String(r.extra_json),
    createdAt: r.created_at ? String(r.created_at) : "",
    updatedAt: r.updated_at ? String(r.updated_at) : "",
  }));

  return { rows, total };
}

export type UserPayoutProfile = {
  balance: number;
  withdrawMethod: string | null;
  withdrawAccount: string | null;
  withdrawMinAmount: number;
};

export async function getUserPayoutProfile(userId: number): Promise<UserPayoutProfile | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT balance, withdraw_method, withdraw_account, withdraw_min_amount FROM users WHERE id = ? LIMIT 1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    balance: Number(r.balance ?? 0),
    withdrawMethod: r.withdraw_method == null ? null : String(r.withdraw_method),
    withdrawAccount: r.withdraw_account == null ? null : String(r.withdraw_account),
    withdrawMinAmount: Number(r.withdraw_min_amount ?? 50),
  };
}

export async function getCompletedPayoutInvoice(
  recipientId: number,
  payoutId: number,
): Promise<PayoutRow | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, status, amount, sold_amount, subs_amount, subs_bonus, method, extra_json, created_at, updated_at
     FROM payouts WHERE recipient_id = ? AND id = ? AND status = 1 LIMIT 1`,
    [recipientId, payoutId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    status: Number(r.status),
    amount: Number(r.amount ?? 0),
    soldAmount: Number(r.sold_amount ?? 0),
    subsAmount: Number(r.subs_amount ?? 0),
    subsBonus: r.subs_bonus == null ? null : Number(r.subs_bonus),
    method: r.method == null ? null : String(r.method),
    extraJson: r.extra_json == null ? null : String(r.extra_json),
    createdAt: r.created_at ? String(r.created_at) : "",
    updatedAt: r.updated_at ? String(r.updated_at) : "",
  };
}

export function formatPayoutDisplayDate(iso: string): string {
  try {
    return format(new Date(iso), "dd.MM.yyyy");
  } catch {
    return iso;
  }
}
