import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  getPackagesAuthorById,
  type PackagesAuthor,
} from "@/lib/packages-admin";
import {
  buildMarketplaceSecureObjectKey,
} from "@/lib/marketplace-r2-presign";
import { getMarketItemsByIds } from "@/lib/market-items";
import type { Product, ProductFiles } from "@/lib/product-types";
import { normalizeProductFiles } from "@/lib/product-ui";
import { r2PublicUrlForKey } from "@/lib/r2-storage";

const DEFAULT_TABLE = "marketplace_items";

function tableName(): string {
  const raw = process.env.DB_MARKET_ITEMS_TABLE ?? DEFAULT_TABLE;
  return /^[a-zA-Z0-9_]+$/.test(raw) ? raw : DEFAULT_TABLE;
}

let versionColumnEnsured = false;

/** Lazy-add `version` on marketplace_items (no-op if already present). */
export async function ensureMarketplaceItemsVersionColumn(): Promise<void> {
  if (versionColumnEnsured) return;
  const pool = getPool();
  const table = tableName();
  try {
    const [cols] = await pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'version'
       LIMIT 1`,
      [table],
    );
    if (cols.length === 0) {
      await pool.query(
        `ALTER TABLE \`${table}\` ADD COLUMN \`version\` VARCHAR(64) NULL AFTER \`name\``,
      );
    }
    versionColumnEnsured = true;
  } catch (err) {
    console.error("[packages-projects] ensure version column", err);
    // Still mark attempted so we don't spam ALTER on every request if perms fail.
    versionColumnEnsured = true;
    throw err;
  }
}

export type PackagesProjectDto = {
  id: number;
  author_id: number;
  name: string;
  version: string | null;
  description: string;
  previewUrl: string | null;
  videoPreviewUrl: string | null;
  downloadKey: string | null;
  downloadUrl: string | null;
  files: ProductFiles;
  access: number;
  created_at: string;
  updated_at: string;
};

function resolveMediaUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.includes("/")) {
    try {
      return r2PublicUrlForKey(s.replace(/^\/+/, ""));
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveDownloadKey(product: Product): string | null {
  const files = normalizeProductFiles(product.files);
  const main = files.main?.trim();
  if (!main) return null;
  if (main.includes("/")) return main.replace(/^\/+/, "");
  return buildMarketplaceSecureObjectKey(product.id, main) || null;
}

export function productToPackagesProjectDto(product: Product): PackagesProjectDto {
  const files = normalizeProductFiles(product.files);
  const downloadKey = resolveDownloadKey(product);
  const previewUrl =
    resolveMediaUrl(files.image) ||
    resolveMediaUrl(product.demo_url) ||
    null;
  const videoPreviewUrl =
    resolveMediaUrl(files.video) ||
    resolveMediaUrl(product.youtube_preview) ||
    null;

  let downloadUrl: string | null = null;
  if (downloadKey) {
    // Public CDN only for keys under public/; private keys stay key-only.
    if (downloadKey.startsWith("public/")) {
      try {
        downloadUrl = r2PublicUrlForKey(downloadKey);
      } catch {
        downloadUrl = null;
      }
    }
  }

  return {
    id: product.id,
    author_id: product.author_id,
    name: product.name,
    version: product.version ?? null,
    description: product.description,
    previewUrl,
    videoPreviewUrl,
    downloadKey,
    downloadUrl,
    files,
    access: product.access,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

function rowToProductLoose(row: RowDataPacket): Product | null {
  if (row.deleted_at != null) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;

  let files: ProductFiles = {};
  try {
    const raw = row.files;
    if (typeof raw === "string" && raw) files = JSON.parse(raw) as ProductFiles;
    else if (raw && typeof raw === "object") files = raw as ProductFiles;
  } catch {
    files = {};
  }

  return {
    id,
    author_id: Number(row.author_id) || 0,
    access: Number(row.access) || 0,
    price: Number(row.price) || 0,
    team: row.team == null ? null : String(row.team),
    exclusive: Number(row.exclusive) || 0,
    subscription: Number(row.subscription) || 0,
    index_category_slug: String(row.index_category_slug ?? ""),
    sub_category_slug: String(row.sub_category_slug ?? ""),
    name: String(row.name ?? ""),
    version: row.version == null || row.version === "" ? null : String(row.version),
    description: String(row.description ?? ""),
    description_html: row.description_html == null ? null : String(row.description_html),
    description_json: {},
    tags: String(row.tags ?? ""),
    has_qty: Number(row.has_qty) || 0,
    attributes: {},
    extra: row.extra == null ? null : String(row.extra),
    json_args: row.json_args == null ? null : String(row.json_args),
    files,
    has_demo: row.has_demo == null ? null : Number(row.has_demo),
    demo_url: row.demo_url == null ? null : String(row.demo_url),
    has_external: row.has_external == null ? null : Number(row.has_external),
    external_domain: row.external_domain == null ? null : String(row.external_domain),
    external_url: row.external_url == null ? null : String(row.external_url),
    youtube_preview: row.youtube_preview == null ? null : String(row.youtube_preview),
    discount_price: row.discount_price == null ? null : Number(row.discount_price),
    discount_start: row.discount_start == null ? null : String(row.discount_start),
    discount_end: row.discount_end == null ? null : String(row.discount_end),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? new Date().toISOString()),
  };
}

export function assertPackagesAuthorId(authorId: number): PackagesAuthor {
  const author = getPackagesAuthorById(authorId);
  if (!author) throw new Error("UNKNOWN_AUTHOR");
  return author;
}

/** All non-deleted items for a packages author (any access). */
export async function listPackagesProjects(
  authorId: number,
): Promise<PackagesProjectDto[]> {
  assertPackagesAuthorId(authorId);
  await ensureMarketplaceItemsVersionColumn();
  const pool = getPool();
  const table = tableName();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${table}\`
     WHERE author_id = ? AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 500`,
    [authorId],
  );
  return rows
    .map(rowToProductLoose)
    .filter((p): p is Product => p != null)
    .map(productToPackagesProjectDto);
}

export async function getPackagesProject(
  authorId: number,
  itemId: number,
): Promise<PackagesProjectDto | null> {
  assertPackagesAuthorId(authorId);
  await ensureMarketplaceItemsVersionColumn();
  const pool = getPool();
  const table = tableName();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${table}\`
     WHERE id = ? AND author_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [itemId, authorId],
  );
  const product = rows[0] ? rowToProductLoose(rows[0]) : null;
  return product ? productToPackagesProjectDto(product) : null;
}

/** Soft-delete a packages project (`deleted_at`). */
export async function deletePackagesProject(
  authorId: number,
  itemId: number,
): Promise<void> {
  assertPackagesAuthorId(authorId);
  const existing = await getPackagesProject(authorId, itemId);
  if (!existing) throw new Error("NOT_FOUND");

  const pool = getPool();
  const table = tableName();
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE \`${table}\`
     SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = ? AND author_id = ? AND deleted_at IS NULL`,
    [itemId, authorId],
  );
  if (result.affectedRows < 1) throw new Error("NOT_FOUND");
}

export async function createPackagesProject(opts: {
  authorId: number;
  name?: string;
  version?: string | null;
  description?: string;
}): Promise<PackagesProjectDto> {
  const author = assertPackagesAuthorId(opts.authorId);
  await ensureMarketplaceItemsVersionColumn();
  const pool = getPool();
  const table = tableName();
  const name = (opts.name?.trim() || "Untitled project").slice(0, 255);
  const version = opts.version?.trim() ? opts.version.trim().slice(0, 64) : null;
  const description = opts.description?.trim() || "";
  const category =
    author.slug === "spunkram" ? "after-effects" : "premiere-pro";

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO \`${table}\`
      (author_id, access, price, exclusive, subscription, index_category_slug, sub_category_slug,
       name, version, description, tags, has_qty, files, created_at, updated_at)
     VALUES (?, 0, 0, 0, 1, ?, '', ?, ?, ?, '', 0, ?, NOW(), NOW())`,
    [
      opts.authorId,
      category,
      name,
      version,
      description,
      JSON.stringify({}),
    ],
  );

  const id = Number(result.insertId);
  const created = await getPackagesProject(opts.authorId, id);
  if (!created) throw new Error("CREATE_FAILED");
  return created;
}

export type PackagesProjectPatch = {
  name?: string;
  version?: string | null;
  description?: string;
  previewKeyOrUrl?: string | null;
  videoKeyOrUrl?: string | null;
  youtubePreview?: string | null;
  downloadKey?: string | null;
  access?: number;
};

export async function updatePackagesProject(
  authorId: number,
  itemId: number,
  patch: PackagesProjectPatch,
): Promise<PackagesProjectDto> {
  assertPackagesAuthorId(authorId);
  await ensureMarketplaceItemsVersionColumn();

  const existing = await getPackagesProject(authorId, itemId);
  if (!existing) throw new Error("NOT_FOUND");

  const files: ProductFiles = { ...existing.files };
  if (patch.previewKeyOrUrl !== undefined) {
    if (patch.previewKeyOrUrl == null || patch.previewKeyOrUrl === "") {
      delete files.image;
    } else {
      files.image = patch.previewKeyOrUrl.trim();
    }
  }
  if (patch.videoKeyOrUrl !== undefined) {
    if (patch.videoKeyOrUrl == null || patch.videoKeyOrUrl === "") {
      delete files.video;
    } else {
      files.video = patch.videoKeyOrUrl.trim();
    }
  }
  if (patch.downloadKey !== undefined) {
    if (patch.downloadKey == null || patch.downloadKey === "") {
      delete files.main;
    } else {
      // Store full R2 key when path-like; otherwise treat as stem for secure layout.
      files.main = patch.downloadKey.trim().replace(/^\/+/, "");
    }
  }

  const name =
    patch.name !== undefined ? patch.name.trim().slice(0, 255) || existing.name : existing.name;
  const version =
    patch.version !== undefined
      ? patch.version?.trim()
        ? patch.version.trim().slice(0, 64)
        : null
      : existing.version;
  const description =
    patch.description !== undefined ? patch.description : existing.description;
  const access =
    patch.access !== undefined && Number.isFinite(patch.access)
      ? Number(patch.access)
      : existing.access;

  const pool = getPool();
  const table = tableName();

  if (patch.youtubePreview !== undefined) {
    await pool.query(
      `UPDATE \`${table}\`
       SET name = ?, version = ?, description = ?, files = ?, access = ?,
           youtube_preview = ?, updated_at = NOW()
       WHERE id = ? AND author_id = ?`,
      [
        name,
        version,
        description,
        JSON.stringify(files),
        access,
        patch.youtubePreview?.trim() || null,
        itemId,
        authorId,
      ],
    );
  } else {
    await pool.query(
      `UPDATE \`${table}\`
       SET name = ?, version = ?, description = ?, files = ?, access = ?, updated_at = NOW()
       WHERE id = ? AND author_id = ?`,
      [name, version, description, JSON.stringify(files), access, itemId, authorId],
    );
  }

  const updated = await getPackagesProject(authorId, itemId);
  if (!updated) throw new Error("UPDATE_FAILED");
  return updated;
}

export function isDownloadKeyAllowedForAuthor(
  author: PackagesAuthor,
  key: string,
): boolean {
  const normalized = key.replace(/^\/+/, "");
  if (author.r2Prefixes.some((p) => normalized.startsWith(p))) return true;
  // Secure marketplace layout for this author's items
  if (normalized.startsWith("secure/market/items/")) return true;
  return false;
}

/** Load raw Product for download helpers. */
export async function getPackagesProductRow(
  authorId: number,
  itemId: number,
): Promise<Product | null> {
  const items = await getMarketItemsByIds([itemId]);
  const item = items[0];
  if (!item || item.author_id !== authorId) return null;
  return item;
}
