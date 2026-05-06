import "server-only";
import type { RowDataPacket } from "mysql2";
import { format } from "date-fns";
import { getPool } from "@/lib/db";

export const ADMIN_OFFERS_PER_PAGE = 24;

export type OfferRow = {
  id: number;
  visible: number;
  type: string;
  poster: number | null;
  slug: string;
  title: string;
  short_title: string;
  subtitle: string | null;
  custom_json: string | null;
  items: string | null;
  categories: string | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
  created_date: string;
  updated_date: string;
  status_label: string;
  status_tone: "active" | "scheduled" | "finished" | "draft";
};

export type OfferDetail = OfferRow & {
  items_arr: number[];
  categories_arr: string[];
};

export const OFFER_TYPES: { id: string; title: string }[] = [
  { id: "offer", title: "Offer" },
  { id: "collection", title: "Collection" },
  { id: "discount", title: "Discount (needs date range)" },
];

function fmtDate(s: unknown): string {
  if (!s) return "—";
  try {
    return format(new Date(String(s)), "dd.MM.yyyy");
  } catch {
    return String(s);
  }
}

function statusFor(start: unknown, end: unknown): { label: string; tone: OfferRow["status_tone"] } {
  if (!start || !end) return { label: "Draft / unscheduled", tone: "draft" };
  const now = new Date();
  const s = new Date(String(start));
  const e = new Date(String(end));
  if (Number.isFinite(s.getTime()) && Number.isFinite(e.getTime())) {
    if (s <= now && e >= now) {
      const days = Math.ceil((e.getTime() - now.getTime()) / 86_400_000);
      return { label: `Active — ${days} day(s) left`, tone: "active" };
    }
    if (s > now) {
      const days = Math.ceil((s.getTime() - now.getTime()) / 86_400_000);
      return { label: `Scheduled — starts in ${days} day(s)`, tone: "scheduled" };
    }
    return { label: "Finished", tone: "finished" };
  }
  return { label: "Draft / unscheduled", tone: "draft" };
}

function rowToOfferRow(r: RowDataPacket): OfferRow {
  const status = statusFor(r.start_at, r.end_at);
  return {
    id: Number(r.id),
    visible: Number(r.visible ?? 0),
    type: String(r.type ?? "offer"),
    poster: r.poster == null ? null : Number(r.poster),
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    short_title: String(r.short_title ?? ""),
    subtitle: r.subtitle == null ? null : String(r.subtitle),
    custom_json: r.custom_json == null ? null : String(r.custom_json),
    items: r.items == null ? null : String(r.items),
    categories: r.categories == null ? null : String(r.categories),
    start_at: r.start_at == null ? null : String(r.start_at),
    end_at: r.end_at == null ? null : String(r.end_at),
    created_at: r.created_at ? String(r.created_at) : "",
    updated_at: r.updated_at ? String(r.updated_at) : "",
    created_date: fmtDate(r.created_at),
    updated_date: fmtDate(r.updated_at),
    status_label: status.label,
    status_tone: status.tone,
  };
}

export async function getOffersAdminPage(
  page: number,
): Promise<{ rows: OfferRow[]; total: number }> {
  const pool = getPool();
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * ADMIN_OFFERS_PER_PAGE;

  const [countRows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM offer_pages`,
  );
  const total = Number(countRows[0]?.c ?? 0);

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, visible, type, poster, slug, title, short_title, subtitle, custom_json,
            items, categories, start_at, end_at, created_at, updated_at
       FROM offer_pages
       ORDER BY created_at DESC
       LIMIT ${ADMIN_OFFERS_PER_PAGE} OFFSET ${offset}`,
  );

  return {
    rows: rows.map(rowToOfferRow),
    total,
  };
}

export async function getOfferById(id: number): Promise<OfferDetail | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, visible, type, poster, slug, title, short_title, subtitle, custom_json,
            items, categories, start_at, end_at, created_at, updated_at
       FROM offer_pages WHERE id = ? LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const base = rowToOfferRow(r);
  const items_arr = base.items
    ? base.items
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const categories_arr = base.categories
    ? base.categories
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return { ...base, items_arr, categories_arr };
}

export async function offerSlugExists(slug: string, excludeId?: number): Promise<boolean> {
  const pool = getPool();
  if (excludeId) {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM offer_pages WHERE slug = ? AND id <> ? LIMIT 1`,
      [slug, excludeId],
    );
    return rows.length > 0;
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM offer_pages WHERE slug = ? LIMIT 1`,
    [slug],
  );
  return rows.length > 0;
}
