"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";
import {
  helpCategorySlugExists,
  helpSlugExists,
  makeSlugLinker,
} from "@/lib/admin/help-center";

async function requireStaff() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/help_center", "layout");
}

export type HelpActionResult = { ok: true; id?: number; slug?: string } | { ok: false; error: string };

export async function toggleHelpArticleVisibility(
  id: number,
  visible: boolean,
): Promise<HelpActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid article" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE help_center_articles SET visible = ?, updated_at = NOW() WHERE id = ?`,
    [visible ? 1 : 0, id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Article not found" };
  revalidate();
  return { ok: true, id };
}

export async function deleteHelpArticle(id: number): Promise<HelpActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid article" };
  const pool = getPool();
  const [res] = await pool.execute(`DELETE FROM help_center_articles WHERE id = ?`, [id]);
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Article not found" };
  revalidate();
  return { ok: true, id };
}

export async function createHelpArticleAction(input: {
  categoryId: number;
  title: string;
  slug?: string;
  content: string;
  visible: boolean;
}): Promise<HelpActionResult> {
  await requireStaff();
  const title = input.title?.trim() ?? "";
  if (!title) return { ok: false, error: "Title required" };
  if (title.length > 70) return { ok: false, error: "Title max 70 chars" };
  const slug = (input.slug?.trim() || makeSlugLinker(title)).slice(0, 70);
  if (!slug) return { ok: false, error: "Could not derive slug" };
  if (!Number.isFinite(input.categoryId) || input.categoryId <= 0)
    return { ok: false, error: "Category required" };

  const exists = await helpSlugExists(input.categoryId, slug);
  if (exists) return { ok: false, error: "Slug already exists in this category" };

  const pool = getPool();
  const [res] = await pool.execute(
    `INSERT INTO help_center_articles (category_id, title, slug, content, content_json, visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', ?, NOW(), NOW())`,
    [input.categoryId, title, slug, input.content ?? "", input.visible ? 1 : 0],
  );
  const id = (res as ResultSetHeader).insertId ?? 0;
  revalidate();
  return { ok: true, id, slug };
}

export async function updateHelpArticleAction(input: {
  id: number;
  categoryId: number;
  title: string;
  slug?: string;
  content: string;
  visible: boolean;
}): Promise<HelpActionResult> {
  await requireStaff();
  if (!Number.isFinite(input.id) || input.id <= 0) return { ok: false, error: "Invalid article" };
  const title = input.title?.trim() ?? "";
  if (!title) return { ok: false, error: "Title required" };
  const slug = (input.slug?.trim() || makeSlugLinker(title)).slice(0, 70);
  if (!slug) return { ok: false, error: "Could not derive slug" };

  const exists = await helpSlugExists(input.categoryId, slug, input.id);
  if (exists) return { ok: false, error: "Slug already exists in this category" };

  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE help_center_articles
       SET category_id = ?, title = ?, slug = ?, content = ?, visible = ?, updated_at = NOW()
       WHERE id = ?`,
    [input.categoryId, title, slug, input.content ?? "", input.visible ? 1 : 0, input.id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Article not found" };
  revalidate();
  return { ok: true, id: input.id, slug };
}

export async function createHelpCategoryAction(input: {
  sectionSlug: string;
  title: string;
  slug?: string;
}): Promise<HelpActionResult> {
  await requireStaff();
  const title = input.title?.trim() ?? "";
  const sectionSlug = input.sectionSlug?.trim() ?? "";
  if (!title) return { ok: false, error: "Title required" };
  if (!sectionSlug) return { ok: false, error: "Section required" };
  const slug = (input.slug?.trim() || makeSlugLinker(title)).slice(0, 70);
  if (!slug) return { ok: false, error: "Could not derive slug" };

  const exists = await helpCategorySlugExists(sectionSlug, slug);
  if (exists) return { ok: false, error: "Category slug already exists in this section" };

  const pool = getPool();
  const [res] = await pool.execute(
    `INSERT INTO help_center_categories (section_slug, title, slug, visible, created_at, updated_at)
     VALUES (?, ?, ?, 1, NOW(), NOW())`,
    [sectionSlug, title, slug],
  );
  const id = (res as ResultSetHeader).insertId ?? 0;
  revalidate();
  return { ok: true, id, slug };
}

export async function deleteHelpCategoryAction(id: number): Promise<HelpActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid category" };
  const pool = getPool();
  const [check] = await pool.execute(
    `SELECT COUNT(*) AS c FROM help_center_articles WHERE category_id = ?`,
    [id],
  );
  const count = Number((check as { c?: number }[])[0]?.c ?? 0);
  if (count > 0) return { ok: false, error: `Category has ${count} article(s) — move or delete them first` };
  await pool.execute(`DELETE FROM help_center_categories WHERE id = ?`, [id]);
  revalidate();
  return { ok: true, id };
}
