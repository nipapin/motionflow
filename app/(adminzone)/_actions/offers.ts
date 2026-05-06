"use server";

import { revalidatePath } from "next/cache";
import type { ResultSetHeader } from "mysql2";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { getPool } from "@/lib/db";
import { offerSlugExists, OFFER_TYPES } from "@/lib/admin/offers";
import { makeSlugLinker } from "@/lib/admin/help-center";

async function requireStaff() {
  const u = await getSessionUser();
  if (!u || !isInvestor(u)) throw new Error("Forbidden");
  return u;
}

function revalidate() {
  revalidatePath("/adminzone/offers", "layout");
}

export type OfferActionResult = { ok: true; id?: number; slug?: string } | { ok: false; error: string };

const ALLOWED_TYPE_IDS = OFFER_TYPES.map((t) => t.id);

function normaliseList(raw: string | undefined): string {
  if (!raw) return "";
  const arr = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.join(",");
}

export async function toggleOfferVisibility(id: number, visible: boolean): Promise<OfferActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid offer" };
  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE offer_pages SET visible = ?, updated_at = NOW() WHERE id = ?`,
    [visible ? 1 : 0, id],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Offer not found" };
  revalidate();
  return { ok: true, id };
}

export async function deleteOfferAction(id: number): Promise<OfferActionResult> {
  await requireStaff();
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid offer" };
  const pool = getPool();
  const [res] = await pool.execute(`DELETE FROM offer_pages WHERE id = ?`, [id]);
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Offer not found" };
  revalidate();
  return { ok: true, id };
}

export async function createOfferAction(input: {
  title: string;
  shortTitle: string;
  subtitle?: string | null;
  slug?: string | null;
  type: string;
  visible: boolean;
  selectCategories: string;
  itemsList?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}): Promise<OfferActionResult> {
  await requireStaff();
  if (!ALLOWED_TYPE_IDS.includes(input.type)) return { ok: false, error: "Invalid offer type" };

  const title = input.title?.trim() ?? "";
  if (!title) return { ok: false, error: "Title required" };
  const shortTitle = input.shortTitle?.trim() ?? "";
  if (!shortTitle) return { ok: false, error: "Short title required" };
  if (shortTitle.length > 70) return { ok: false, error: "Short title max 70 chars" };
  const slug = (input.slug?.trim() || makeSlugLinker(shortTitle)).slice(0, 60);
  if (!slug) return { ok: false, error: "Could not derive slug" };

  if (await offerSlugExists(slug)) return { ok: false, error: "Slug already exists" };

  const cats = normaliseList(input.selectCategories);
  if (!cats) return { ok: false, error: "Pick at least one category" };

  const pool = getPool();
  const [res] = await pool.execute(
    `INSERT INTO offer_pages
       (visible, type, slug, title, short_title, subtitle, items, categories, start_at, end_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      input.visible ? 1 : 0,
      input.type,
      slug,
      title,
      shortTitle,
      input.subtitle?.trim() || null,
      normaliseList(input.itemsList ?? "") || null,
      cats,
      input.startAt || null,
      input.endAt || null,
    ],
  );
  const id = (res as ResultSetHeader).insertId ?? 0;
  revalidate();
  return { ok: true, id, slug };
}

export async function updateOfferAction(input: {
  id: number;
  title: string;
  shortTitle: string;
  subtitle?: string | null;
  slug?: string | null;
  type: string;
  visible: boolean;
  selectCategories: string;
  itemsList?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}): Promise<OfferActionResult> {
  await requireStaff();
  if (!Number.isFinite(input.id) || input.id <= 0) return { ok: false, error: "Invalid offer" };
  if (!ALLOWED_TYPE_IDS.includes(input.type)) return { ok: false, error: "Invalid offer type" };

  const title = input.title?.trim() ?? "";
  if (!title) return { ok: false, error: "Title required" };
  const shortTitle = input.shortTitle?.trim() ?? "";
  if (!shortTitle) return { ok: false, error: "Short title required" };
  const slug = (input.slug?.trim() || makeSlugLinker(shortTitle)).slice(0, 60);
  if (!slug) return { ok: false, error: "Could not derive slug" };

  if (await offerSlugExists(slug, input.id)) return { ok: false, error: "Slug already exists" };

  const cats = normaliseList(input.selectCategories);
  if (!cats) return { ok: false, error: "Pick at least one category" };

  const pool = getPool();
  const [res] = await pool.execute(
    `UPDATE offer_pages
        SET visible = ?, type = ?, slug = ?, title = ?, short_title = ?, subtitle = ?,
            items = ?, categories = ?, start_at = ?, end_at = ?, updated_at = NOW()
        WHERE id = ?`,
    [
      input.visible ? 1 : 0,
      input.type,
      slug,
      title,
      shortTitle,
      input.subtitle?.trim() || null,
      normaliseList(input.itemsList ?? "") || null,
      cats,
      input.startAt || null,
      input.endAt || null,
      input.id,
    ],
  );
  const affected = (res as ResultSetHeader).affectedRows ?? 0;
  if (!affected) return { ok: false, error: "Offer not found" };
  revalidate();
  return { ok: true, id: input.id, slug };
}
