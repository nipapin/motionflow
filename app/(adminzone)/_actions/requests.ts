"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";

async function requireStaff() {
  const user = await getSessionUser();
  if (!user || !isInvestor(user)) throw new Error("Forbidden");
  return user;
}

function revalidateRequests() {
  revalidatePath("/adminzone/requests", "layout");
  revalidatePath("/adminzone/dashboard");
}

export async function assignRequestToMeAction(requestId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaff();
  if (!Number.isFinite(requestId) || requestId <= 0) return { ok: false, error: "Invalid request" };

  const pool = getPool();
  const [res] = await pool.execute(`UPDATE request_messages SET assigned_staff_id = ? WHERE id = ? AND answered IS NULL`, [
    user.id,
    requestId,
  ]);
  const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Not found or already closed" };
  revalidateRequests();
  return { ok: true };
}

export async function closeRequestAction(
  requestId: number,
  resolution: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaff();
  if (!Number.isFinite(requestId) || requestId <= 0) return { ok: false, error: "Invalid request" };
  const ans = resolution.trim();
  if (!ans) return { ok: false, error: "Resolution required" };

  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE request_messages SET answered = ?, answered_staff_id = ?, expect_resolve = 0 WHERE id = ? AND answered IS NULL`,
    [ans, user.id, requestId],
  );
  const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Not found or already closed" };
  revalidateRequests();
  return { ok: true };
}

export async function reopenRequestAction(requestId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireStaff();
  if (!Number.isFinite(requestId) || requestId <= 0) return { ok: false, error: "Invalid request" };

  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE request_messages SET answered = NULL, assigned_staff_id = ? WHERE id = ?`,
    [user.id, requestId],
  );
  const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Not found" };
  revalidateRequests();
  return { ok: true };
}
