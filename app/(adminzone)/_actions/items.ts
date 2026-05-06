"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

async function requireStaff() {
  const user = await getSessionUser();
  if (!user || !isInvestor(user)) throw new Error("Forbidden");
  return user;
}

function revalidateItems() {
  revalidatePath("/adminzone/items_access", "layout");
  revalidatePath("/adminzone/dashboard");
}

export async function approveItemAction(itemId: number): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  if (!Number.isFinite(itemId) || itemId <= 0) return { ok: false, error: "Invalid item" };

  const pool = getPool();
  const table = marketplaceItemsTable();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM approval_requires WHERE item_id = ?`, [itemId]);
    const [res] = await conn.execute(`UPDATE \`${table}\` SET access = 1 WHERE id = ?`, [itemId]);
    const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
    if (!affected) {
      await conn.rollback();
      return { ok: false, error: "Item not found" };
    }
    await conn.commit();
    revalidateItems();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    console.error("[approveItemAction]", e);
    return { ok: false, error: "Database error" };
  } finally {
    conn.release();
  }
}

async function upsertApproval(
  itemId: number,
  staffId: number,
  status: "soft_reject" | "rejected" | "blocked",
  comment: string,
  access: 0 | -1,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = comment.trim();
  if (!trimmed) return { ok: false, error: "Comment is required" };

  const pool = getPool();
  const table = marketplaceItemsTable();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM approval_requires WHERE item_id = ?`, [itemId]);
    await conn.execute(
      `INSERT INTO approval_requires (item_id, staff_id, status, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [itemId, staffId, status, trimmed],
    );
    const [res] = await conn.execute(`UPDATE \`${table}\` SET access = ? WHERE id = ?`, [access, itemId]);
    const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
    if (!affected) {
      await conn.rollback();
      return { ok: false, error: "Item not found" };
    }
    await conn.commit();
    revalidateItems();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    console.error("[upsertApproval]", e);
    return { ok: false, error: "Database error" };
  } finally {
    conn.release();
  }
}

export async function softRejectItemAction(itemId: number, comment: string) {
  const user = await requireStaff();
  return upsertApproval(itemId, user.id, "soft_reject", comment, 0);
}

export async function hardRejectItemAction(itemId: number, comment: string) {
  const user = await requireStaff();
  return upsertApproval(itemId, user.id, "rejected", comment, -1);
}

export async function blockItemAction(itemId: number, comment: string) {
  const user = await requireStaff();
  return upsertApproval(itemId, user.id, "blocked", comment, -1);
}

/** Clear moderation flags and return item to pending queue (access 0). */
export async function unblockItemAction(itemId: number): Promise<{ ok: boolean; error?: string }> {
  await requireStaff();
  if (!Number.isFinite(itemId) || itemId <= 0) return { ok: false, error: "Invalid item" };

  const pool = getPool();
  const table = marketplaceItemsTable();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM approval_requires WHERE item_id = ?`, [itemId]);
    const [res] = await conn.execute(`UPDATE \`${table}\` SET access = 0 WHERE id = ?`, [itemId]);
    const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
    if (!affected) {
      await conn.rollback();
      return { ok: false, error: "Item not found" };
    }
    await conn.commit();
    revalidateItems();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    console.error("[unblockItemAction]", e);
    return { ok: false, error: "Database error" };
  } finally {
    conn.release();
  }
}
