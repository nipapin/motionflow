import "server-only";
import type { RowDataPacket } from "mysql2";
import { format } from "date-fns";
import { getPool } from "@/lib/db";
import { makeSlugLinker } from "@/lib/admin/help-center";

export const TUTORIALS_PER_PAGE = 24;

export type TutorialCategory = {
  slug: string;
  title: string;
  sub_categories: Record<string, { name: string }>;
};

/** Mirrors `config/aniom.php#tutorials.categories`. */
export const TUTORIAL_CATEGORIES: TutorialCategory[] = [
  {
    slug: "after-effects",
    title: "After Effects",
    sub_categories: {
      tutorials: { name: "Tutorials" },
      references: { name: "References" },
      news: { name: "News" },
    },
  },
  {
    slug: "premiere-pro",
    title: "Premiere Pro",
    sub_categories: {
      tutorials: { name: "Tutorials" },
      references: { name: "References" },
      news: { name: "News" },
    },
  },
  {
    slug: "final-cut-pro-x",
    title: "Final Cut Pro X",
    sub_categories: {
      tutorials: { name: "Tutorials" },
      references: { name: "References" },
      news: { name: "News" },
    },
  },
  {
    slug: "addons",
    title: "Addons",
    sub_categories: {
      "scripts-plugins": { name: "Scripts & Plugins" },
      presets: { name: "Presets" },
    },
  },
  {
    slug: "blog",
    title: "Free Blogs",
    sub_categories: {
      useful: { name: "Useful" },
      news: { name: "News" },
      promotions: { name: "Promotions" },
    },
  },
];

export const TUTORIAL_LANGS = ["en", "ru", "es", "de", "fr"] as const;

export type TutorialItemRow = {
  id: number;
  visible: number;
  category_slug: string;
  sub_category_slug: string;
  slug: string;
  title: string;
  description: string;
  label: string | null;
  poster: string | null;
  author_id: number;
  author_name: string | null;
  created_at: string;
  updated_at: string;
  created_date: string;
  updated_date: string;
};

export type TutorialItemDetail = TutorialItemRow & {
  content: string;
  content_json: string | null;
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return format(new Date(s), "dd.MM.yyyy");
  } catch {
    return String(s);
  }
}

export async function getTutorialsPage(
  page: number,
): Promise<{ rows: TutorialItemRow[]; total: number }> {
  const pool = getPool();
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * TUTORIALS_PER_PAGE;

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM tutorial_items`,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.id, t.visible, t.category_slug, t.sub_category_slug, t.slug, t.title,
            t.description, t.label, t.poster, t.author_id, t.created_at, t.updated_at,
            u.name AS author_name
       FROM tutorial_items t
       LEFT JOIN users u ON u.id = t.author_id
       ORDER BY t.created_at DESC
       LIMIT ${TUTORIALS_PER_PAGE} OFFSET ${offset}`,
  );

  const out: TutorialItemRow[] = rows.map((r) => ({
    id: Number(r.id),
    visible: Number(r.visible ?? 0),
    category_slug: String(r.category_slug ?? ""),
    sub_category_slug: String(r.sub_category_slug ?? ""),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    description: r.description == null ? "" : String(r.description),
    label: r.label == null ? null : String(r.label),
    poster: r.poster == null ? null : String(r.poster),
    author_id: Number(r.author_id ?? 0),
    author_name: r.author_name == null ? null : String(r.author_name),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at as string | null),
    updated_date: fmtDate(r.updated_at as string | null),
  }));

  return { rows: out, total };
}

export async function getTutorialById(id: number): Promise<TutorialItemDetail | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT t.id, t.visible, t.category_slug, t.sub_category_slug, t.slug, t.title,
            t.description, t.label, t.poster, t.author_id, t.content, t.content_json,
            t.created_at, t.updated_at,
            u.name AS author_name
       FROM tutorial_items t
       LEFT JOIN users u ON u.id = t.author_id
       WHERE t.id = ? LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    visible: Number(r.visible ?? 0),
    category_slug: String(r.category_slug ?? ""),
    sub_category_slug: String(r.sub_category_slug ?? ""),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    description: r.description == null ? "" : String(r.description),
    label: r.label == null ? null : String(r.label),
    poster: r.poster == null ? null : String(r.poster),
    author_id: Number(r.author_id ?? 0),
    author_name: r.author_name == null ? null : String(r.author_name),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at as string | null),
    updated_date: fmtDate(r.updated_at as string | null),
    content: r.content == null ? "" : String(r.content),
    content_json: r.content_json == null ? null : String(r.content_json),
  };
}

export async function tutorialSlugExists(
  category: string,
  sub: string,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const pool = getPool();
  if (excludeId) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM tutorial_items WHERE category_slug = ? AND sub_category_slug = ? AND slug = ? AND id <> ? LIMIT 1`,
      [category, sub, slug, excludeId],
    );
    return rows.length > 0;
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM tutorial_items WHERE category_slug = ? AND sub_category_slug = ? AND slug = ? LIMIT 1`,
    [category, sub, slug],
  );
  return rows.length > 0;
}

export type TutorialLocaleRow = {
  id: number;
  bind_id: number;
  bind_type: string;
  lang: string;
  title: string;
  description: string;
  visible: number;
};

export async function getTutorialLocales(tutorialId: number): Promise<TutorialLocaleRow[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, bind_id, bind_type, lang, title, description, visible
       FROM articles_locales
       WHERE bind_type = 'tutorial' AND bind_id = ?`,
    [tutorialId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    bind_id: Number(r.bind_id ?? 0),
    bind_type: String(r.bind_type ?? ""),
    lang: String(r.lang ?? ""),
    title: String(r.title ?? ""),
    description: r.description == null ? "" : String(r.description),
    visible: Number(r.visible ?? 0),
  }));
}

export { makeSlugLinker };
