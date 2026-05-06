"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAdmin, isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";

async function requireStaff() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/payouts", "layout");
  revalidatePath("/adminzone/dashboard");
}

export type PayoutActionResult = { ok: true } | { ok: false; error: string };

async function setStatus(id: number, status: number): Promise<PayoutActionResult> {
  const u = await requireStaff();
  if (!isAdmin(u)) return { ok: false, error: "Admin-only action" };
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid payout" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE payouts SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Payout not found" };
  revalidate();
  return { ok: true };
}

export async function approvePayoutAction(id: number) {
  return setStatus(id, 1);
}

export async function cancelPayoutAction(id: number) {
  return setStatus(id, -1);
}

export async function reservePayoutAction(id: number) {
  return setStatus(id, -2);
}

export async function unavailablePayoutAction(id: number) {
  return setStatus(id, -3);
}

export async function addPayoutExtraAction(input: {
  id: number;
  type: string;
  reason: string;
  amount: number;
}): Promise<PayoutActionResult> {
  const u = await requireStaff();
  if (!isAdmin(u)) return { ok: false, error: "Admin-only action" };
  if (!Number.isFinite(input.id) || input.id <= 0) return { ok: false, error: "Invalid payout" };
  const pool = getPool();
  const extra = JSON.stringify({
    type: input.type ?? "note",
    reason: input.reason ?? "",
    amount: Number(input.amount) || 0,
  });
  const [res] = await pool.execute(
    `UPDATE payouts SET extra_json = ?, updated_at = NOW() WHERE id = ?`,
    [extra.slice(0, 255), input.id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Payout not found" };
  revalidate();
  return { ok: true };
}
