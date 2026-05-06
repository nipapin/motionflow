"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";

async function requireStaff() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/affiliate", "layout");
}

export type AffiliateActionResult = { ok: true; id?: number } | { ok: false; error: string };

export async function softDeleteShortLinkAction(id: number): Promise<AffiliateActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid link" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE short_links SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Link not found" };
  revalidate();
  return { ok: true, id };
}

export async function restoreShortLinkAction(id: number): Promise<AffiliateActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid link" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE short_links SET deleted_at = NULL WHERE id = ?`,
    [id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Link not found" };
  revalidate();
  return { ok: true, id };
}
