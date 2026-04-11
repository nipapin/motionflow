import type { RowDataPacket } from "mysql2/promise";
import type { Product, ProductFiles } from "@/lib/product-types";
import { getMysqlPool } from "@/lib/db";
import { softwareLabelToSlug } from "@/lib/product-ui";

const DEFAULT_TABLE = "marketplace_items";
const DEFAULT_LIMIT = 200;

function sanitizedTableName(): string {
  const raw = process.env.DB_MARKET_ITEMS_TABLE ?? DEFAULT_TABLE;
  return /^[a-zA-Z0-9_]+$/.test(raw) ? raw : DEFAULT_TABLE;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null || value === "") return new Date().toISOString();
  return String(value);
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toStr(value: unknown): string {
  return value == null ? "" : String(value);
}

function toStrNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value);
  return s === "" ? null : s;
}

function parseJsonRecord(raw: unknown): Record<string, string> {
  if (raw == null || Array.isArray(raw)) return {};
  if (typeof raw === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = v == null ? "" : String(v);
    }
    return out;
  }
  if (typeof raw !== "string" || raw === "") return {};
  try {
    return parseJsonRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

function parseProductFilesRow(raw: unknown): ProductFiles {
  if (raw == null) return {};
  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (raw === "") return {};
    try {
      obj = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return {};
  const o = obj as Record<string, unknown>;
  return {
    main: typeof o.main === "string" ? o.main : undefined,
    image: typeof o.image === "string" ? o.image : undefined,
    video: typeof o.video === "string" ? o.video : undefined,
  };
}

function rowToProduct(row: RowDataPacket): Product | null {
  if (row.deleted_at != null) return null;

  const id = toNum(row.id, NaN);
  if (!Number.isFinite(id)) return null;

  return {
    id,
    author_id: toNum(row.author_id),
    access: toNum(row.access, 1),
    price: toNum(row.price),
    team: toStrNull(row.team),
    exclusive: toNum(row.exclusive),
    subscription: toNum(row.subscription),
    index_category_slug: toStr(row.index_category_slug),
    sub_category_slug: toStr(row.sub_category_slug),
    name: toStr(row.name),
    description: toStr(row.description),
    description_html: toStrNull(row.description_html),
    description_json: parseJsonRecord(row.description_json),
    tags: toStr(row.tags),
    has_qty: toNum(row.has_qty),
    attributes: parseJsonRecord(row.attributes),
    extra: toStrNull(row.extra),
    json_args: toStrNull(row.json_args),
    files: parseProductFilesRow(row.files),
    has_demo: row.has_demo == null ? null : toNum(row.has_demo),
    demo_url: toStrNull(row.demo_url),
    has_external: row.has_external == null ? null : toNum(row.has_external),
    external_domain: toStrNull(row.external_domain),
    external_url: toStrNull(row.external_url),
    youtube_preview: toStrNull(row.youtube_preview),
    discount_price: row.discount_price == null ? null : toNum(row.discount_price),
    discount_start: toStrNull(row.discount_start),
    discount_end: toStrNull(row.discount_end),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

/**
 * Loads marketplace rows from MySQL using `DB_*` env vars (same as Laravel).
 * Table defaults to `marketplace_items`; override with `DB_MARKET_ITEMS_TABLE`.
 */
export async function getMarketItems(): Promise<Product[]> {
  const pool = getMysqlPool();
  if (!pool) return [];

  const connection = process.env.DB_CONNECTION?.toLowerCase();
  if (connection && connection !== "mysql" && connection !== "mariadb") return [];

  const table = sanitizedTableName();
  const limit = Math.min(
    Math.max(Number(process.env.DB_MARKET_ITEMS_LIMIT ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
    500
  );

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM \`${table}\` WHERE author_id = 6 AND access = 1 ORDER BY id DESC LIMIT ?`,
      [limit]
    );
    return rows.map(rowToProduct).filter((p): p is Product => p != null);
  } catch (err) {
    console.error("[getMarketItems] MySQL query failed:", err);
    return [];
  }
}

function assertSafeSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(slug);
}

/** Items where `index_category_slug` matches (e.g. `after-effects`, `sound-fx`). */
export async function getMarketItemsByIndexCategorySlug(
  indexCategorySlug: string,
  limit = 500
): Promise<Product[]> {
  const pool = getMysqlPool();
  if (!pool || !assertSafeSlug(indexCategorySlug)) return [];

  const connection = process.env.DB_CONNECTION?.toLowerCase();
  if (connection && connection !== "mysql" && connection !== "mariadb") return [];

  const table = sanitizedTableName();
  const capped = Math.min(Math.max(limit, 1), 1000);

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM \`${table}\` WHERE LOWER(index_category_slug) = LOWER(?) AND author_id = 6 AND access = 1 ORDER BY id DESC LIMIT ?`,
      [indexCategorySlug, capped]
    );
    return rows.map(rowToProduct).filter((p): p is Product => p != null);
  } catch (err) {
    console.error("[getMarketItemsByIndexCategorySlug] MySQL query failed:", err);
    return [];
  }
}

/** Resolve sidebar label (e.g. "After Effects") to DB slug and load items. */
export async function getMarketItemsForSoftwareLabel(softwareLabel: string): Promise<Product[]> {
  const slug = softwareLabelToSlug(softwareLabel);
  return getMarketItemsByIndexCategorySlug(slug);
}
