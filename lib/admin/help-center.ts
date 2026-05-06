import "server-only";
import type { RowDataPacket } from "mysql2";
import { format } from "date-fns";
import { getPool } from "@/lib/db";

export const HELP_ARTICLES_PER_PAGE = 24;

export type HelpCategoryRow = {
  id: number;
  visible: number;
  section_slug: string;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type HelpArticleRow = {
  id: number;
  visible: number;
  category_id: number;
  category_title: string | null;
  category_slug: string | null;
  section_slug: string | null;
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
  created_date: string;
  updated_date: string;
};

export type HelpArticleDetail = HelpArticleRow & {
  content: string;
  content_json: string | null;
};

export const HELP_SECTIONS: { slug: string; title: string }[] = [
  { slug: "marketplace", title: "Marketplace" },
  { slug: "atomx-extension", title: "AtomX Extension" },
  { slug: "tutorials", title: "Tutorials" },
];

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return format(new Date(s), "dd.MM.yyyy");
  } catch {
    return String(s);
  }
}

export async function getHelpCategories(): Promise<HelpCategoryRow[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, visible, section_slug, slug, title, created_at, updated_at
     FROM help_center_categories
     ORDER BY section_slug, title`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    visible: Number(r.visible ?? 0),
    section_slug: String(r.section_slug ?? ""),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
  }));
}

export async function getHelpArticlesPage(
  page: number,
): Promise<{ rows: HelpArticleRow[]; total: number }> {
  const pool = getPool();
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * HELP_ARTICLES_PER_PAGE;

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM help_center_articles`,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT a.id, a.visible, a.category_id, a.slug, a.title, a.created_at, a.updated_at,
            c.title AS category_title, c.slug AS category_slug, c.section_slug
       FROM help_center_articles a
       LEFT JOIN help_center_categories c ON c.id = a.category_id
       ORDER BY a.created_at DESC
       LIMIT ${HELP_ARTICLES_PER_PAGE} OFFSET ${offset}`,
  );
  const out: HelpArticleRow[] = rows.map((r) => ({
    id: Number(r.id),
    visible: Number(r.visible ?? 0),
    category_id: Number(r.category_id ?? 0),
    category_title: r.category_title == null ? null : String(r.category_title),
    category_slug: r.category_slug == null ? null : String(r.category_slug),
    section_slug: r.section_slug == null ? null : String(r.section_slug),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at as string | null),
    updated_date: fmtDate(r.updated_at as string | null),
  }));
  return { rows: out, total };
}

export async function getHelpArticleById(id: number): Promise<HelpArticleDetail | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT a.id, a.visible, a.category_id, a.slug, a.title, a.content, a.content_json,
            a.created_at, a.updated_at,
            c.title AS category_title, c.slug AS category_slug, c.section_slug
       FROM help_center_articles a
       LEFT JOIN help_center_categories c ON c.id = a.category_id
       WHERE a.id = ? LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    visible: Number(r.visible ?? 0),
    category_id: Number(r.category_id ?? 0),
    category_title: r.category_title == null ? null : String(r.category_title),
    category_slug: r.category_slug == null ? null : String(r.category_slug),
    section_slug: r.section_slug == null ? null : String(r.section_slug),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at as string | null),
    updated_date: fmtDate(r.updated_at as string | null),
    content: r.content == null ? "" : String(r.content),
    content_json: r.content_json == null ? null : String(r.content_json),
  };
}

export function makeSlugLinker(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export async function helpSlugExists(
  categoryId: number,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const pool = getPool();
  if (excludeId) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM help_center_articles WHERE category_id = ? AND slug = ? AND id <> ? LIMIT 1`,
      [categoryId, slug, excludeId],
    );
    return rows.length > 0;
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM help_center_articles WHERE category_id = ? AND slug = ? LIMIT 1`,
    [categoryId, slug],
  );
  return rows.length > 0;
}

export async function helpCategorySlugExists(
  sectionSlug: string,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const pool = getPool();
  if (excludeId) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM help_center_categories WHERE section_slug = ? AND slug = ? AND id <> ? LIMIT 1`,
      [sectionSlug, slug, excludeId],
    );
    return rows.length > 0;
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM help_center_categories WHERE section_slug = ? AND slug = ? LIMIT 1`,
    [sectionSlug, slug],
  );
  return rows.length > 0;
}
