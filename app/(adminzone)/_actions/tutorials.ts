"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";
import {
  TUTORIAL_CATEGORIES,
  makeSlugLinker,
  tutorialSlugExists,
} from "@/lib/admin/tutorials";

async function requireStaff() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/tutorials", "layout");
}

export type TutorialActionResult = { ok: true; id?: number; slug?: string } | { ok: false; error: string };

function validateCategory(catKey: string): { category: string; sub: string } | null {
  const [c, s] = catKey.split("@");
  if (!c || !s) return null;
  const cat = TUTORIAL_CATEGORIES.find((cc) => cc.slug === c);
  if (!cat) return null;
  if (!cat.sub_categories[s]) return null;
  return { category: c, sub: s };
}

export async function toggleTutorialVisibility(
  id: number,
  visible: boolean,
): Promise<TutorialActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid tutorial" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE tutorial_items SET visible = ?, updated_at = NOW() WHERE id = ?`,
    [visible ? 1 : 0, id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Tutorial not found" };
  revalidate();
  return { ok: true, id };
}

export async function deleteTutorialAction(id: number): Promise<TutorialActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid tutorial" };
  const pool = getPool();
  await pool.execute(`DELETE FROM articles_locales WHERE bind_type = 'tutorial' AND bind_id = ?`, [id]);
  const [res] = await pool.execute(`DELETE FROM tutorial_items WHERE id = ?`, [id]);
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Tutorial not found" };
  revalidate();
  return { ok: true, id };
}

export async function createTutorialAction(input: {
  categoryKey: string;
  title: string;
  slug?: string;
  description: string;
  content: string;
  visible: boolean;
  label?: string | null;
}): Promise<TutorialActionResult> {
  const staff = await requireStaff();
  const cat = validateCategory(input.categoryKey);
  if (!cat) return { ok: false, error: "Invalid category" };

  const title = input.title?.trim() ?? "";
  if (!title) return { ok: false, error: "Title required" };
  if (title.length > 70) return { ok: false, error: "Title max 70 chars" };
  const slug = (input.slug?.trim() || makeSlugLinker(title)).slice(0, 70);
  if (!slug) return { ok: false, error: "Could not derive slug" };

  const exists = await tutorialSlugExists(cat.category, cat.sub, slug);
  if (exists) return { ok: false, error: "Slug already exists in this sub-category" };

  const pool = getPool();
  const [res] = await pool.execute(
    `INSERT INTO tutorial_items
       (author_id, visible, category_slug, sub_category_slug, title, slug, label,
        description, content, content_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', NOW(), NOW())`,
    [
      staff.id,
      input.visible ? 1 : 0,
      cat.category,
      cat.sub,
      title,
      slug,
      input.label || null,
      (input.description ?? "").slice(0, 100),
      input.content ?? "",
    ],
  );
  const id = (res as ResultSetHeader).insertId ?? 0;
  revalidate();
  return { ok: true, id, slug };
}

export async function updateTutorialAction(input: {
  id: number;
  categoryKey: string;
  title: string;
  slug?: string;
  description: string;
  content: string;
  visible: boolean;
  label?: string | null;
}): Promise<TutorialActionResult> {
  await requireStaff();
  if (!Number.isFinite(input.id) || input.id <= 0) return { ok: false, error: "Invalid tutorial" };
  const cat = validateCategory(input.categoryKey);
  if (!cat) return { ok: false, error: "Invalid category" };

  const title = input.title?.trim() ?? "";
  if (!title) return { ok: false, error: "Title required" };
  const slug = (input.slug?.trim() || makeSlugLinker(title)).slice(0, 70);
  if (!slug) return { ok: false, error: "Could not derive slug" };

  const exists = await tutorialSlugExists(cat.category, cat.sub, slug, input.id);
  if (exists) return { ok: false, error: "Slug already exists in this sub-category" };

  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE tutorial_items
        SET visible = ?, category_slug = ?, sub_category_slug = ?, title = ?, slug = ?,
            label = ?, description = ?, content = ?, updated_at = NOW()
        WHERE id = ?`,
    [
      input.visible ? 1 : 0,
      cat.category,
      cat.sub,
      title,
      slug,
      input.label || null,
      (input.description ?? "").slice(0, 100),
      input.content ?? "",
      input.id,
    ],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Tutorial not found" };
  revalidate();
  return { ok: true, id: input.id, slug };
}
