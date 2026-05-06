"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAdmin, isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";
import { validatePageSettingContent } from "@/lib/admin/page-settings";

async function requireAdmin() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  if (!isAdmin(u)) throw new Error("Admin-only");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/page_settings", "layout");
}

export type PageSettingActionResult = { ok: true; id?: number } | { ok: false; error: string };

export async function createPageSettingAction(input: {
  page: string;
  key: string;
  isJson: number | null;
  content: string;
}): Promise<PageSettingActionResult> {
  await requireAdmin();
  const page = input.page?.trim() ?? "";
  const key = input.key?.trim() ?? "";
  if (!page || !key) return { ok: false, error: "Page and key are required" };

  const v = validatePageSettingContent(input.content ?? "", input.isJson);
  if (!v.ok) return v;

  const pool = getPool();
  const [res] = await pool.execute(
    `INSERT INTO page_settings (page, \`key\`, is_json, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [page, key, v.isJson, v.normalised],
  );
  const id = (res as ResultSetHeader).insertId ?? 0;
  revalidate();
  return { ok: true, id };
}

export async function updatePageSettingAction(input: {
  id: number;
  page: string;
  key: string;
  isJson: number | null;
  content: string;
}): Promise<PageSettingActionResult> {
  await requireAdmin();
  if (!Number.isFinite(input.id) || input.id <= 0) return { ok: false, error: "Invalid setting" };
  const page = input.page?.trim() ?? "";
  const key = input.key?.trim() ?? "";
  if (!page || !key) return { ok: false, error: "Page and key are required" };

  const v = validatePageSettingContent(input.content ?? "", input.isJson);
  if (!v.ok) return v;

  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE page_settings
        SET page = ?, \`key\` = ?, is_json = ?, content = ?, updated_at = NOW()
        WHERE id = ?`,
    [page, key, v.isJson, v.normalised, input.id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Setting not found" };
  revalidate();
  return { ok: true, id: input.id };
}

export async function deletePageSettingAction(id: number): Promise<PageSettingActionResult> {
  await requireAdmin();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid setting" };
  const pool = getPool();
  const [res] = await pool.execute(`DELETE FROM page_settings WHERE id = ?`, [id]);
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Setting not found" };
  revalidate();
  return { ok: true, id };
}
