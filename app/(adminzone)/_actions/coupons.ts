"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";
import { couponCodeExists } from "@/lib/admin/coupons";

async function requireStaff() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/coupons", "layout");
}

export type CouponActionResult = { ok: true; id?: number } | { ok: false; error: string };

const ALLOWED_TYPES = ["value", "percent", "fixed"];

function validateAmount(type: string, amount: number): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(amount) || amount < 5) return { ok: false, error: "Amount must be ≥ 5" };
  if (type === "percent" && amount > 100) return { ok: false, error: "Percent ≤ 100" };
  if ((type === "value" || type === "fixed") && amount > 500) return { ok: false, error: "Fixed amount ≤ 500" };
  return { ok: true };
}

export async function toggleCouponStatus(id: number, status: 1 | -1): Promise<CouponActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid coupon" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE coupon_services SET status = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [status, id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Coupon not found" };
  revalidate();
  return { ok: true, id };
}

export async function deleteCouponAction(id: number): Promise<CouponActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid coupon" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE coupon_services SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Coupon not found" };
  revalidate();
  return { ok: true, id };
}

export async function createCouponAction(input: {
  code: string;
  type: string;
  amount: number;
  globalCoverage: boolean;
  itemId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  maxUses?: number | null;
  priority?: boolean;
  comment?: string | null;
  authorId?: number;
}): Promise<CouponActionResult> {
  const staff = await requireStaff();
  const code = input.code?.trim() ?? "";
  if (!/^[a-zA-Z0-9-_]{1,50}$/.test(code)) return { ok: false, error: "Code: 1–50 alphanum/-/_ chars" };
  if (!ALLOWED_TYPES.includes(input.type)) return { ok: false, error: "Invalid discount type" };

  const v = validateAmount(input.type, input.amount);
  if (!v.ok) return v;

  if (await couponCodeExists(code)) return { ok: false, error: "Coupon code already exists" };

  const assigned = input.globalCoverage ? 0 : Number(input.itemId ?? 0);
  if (!input.globalCoverage && (!Number.isFinite(assigned) || assigned <= 0))
    return { ok: false, error: "Project ID required when not global" };

  const authorId = input.authorId ?? staff.id;
  const pool = getPool();
  const [res] = await pool.execute(
    `INSERT INTO coupon_services
       (author_id, assigned_id, status, code, type, amount, start_date, end_date, max_uses, priority, comment, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      authorId,
      assigned,
      code,
      input.type,
      input.amount,
      input.startDate || null,
      input.endDate || null,
      input.maxUses ?? null,
      input.priority ? 1 : 0,
      (input.comment ?? "").slice(0, 100) || null,
    ],
  );
  const id = (res as ResultSetHeader).insertId ?? 0;
  revalidate();
  return { ok: true, id };
}

export async function updateCouponAction(input: {
  id: number;
  type: string;
  amount: number;
  globalCoverage: boolean;
  itemId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  maxUses?: number | null;
  priority?: boolean;
  comment?: string | null;
}): Promise<CouponActionResult> {
  await requireStaff();
  if (!Number.isFinite(input.id) || input.id <= 0) return { ok: false, error: "Invalid coupon" };
  if (!ALLOWED_TYPES.includes(input.type)) return { ok: false, error: "Invalid discount type" };
  const v = validateAmount(input.type, input.amount);
  if (!v.ok) return v;

  const assigned = input.globalCoverage ? 0 : Number(input.itemId ?? 0);
  if (!input.globalCoverage && (!Number.isFinite(assigned) || assigned <= 0))
    return { ok: false, error: "Project ID required when not global" };

  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE coupon_services
        SET assigned_id = ?, type = ?, amount = ?, start_date = ?, end_date = ?,
            max_uses = ?, priority = ?, comment = ?, updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL`,
    [
      assigned,
      input.type,
      input.amount,
      input.startDate || null,
      input.endDate || null,
      input.maxUses ?? null,
      input.priority ? 1 : 0,
      (input.comment ?? "").slice(0, 100) || null,
      input.id,
    ],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Coupon not found" };
  revalidate();
  return { ok: true, id: input.id };
}
