import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import {
  getPackagesAuthorById,
  type PackagesAuthor,
} from "@/lib/packages-admin";
import {
  ensurePackagesProjectsTable,
  packagesProjectsTableName,
} from "@/lib/packages-authors-db";
import { r2PublicUrlForKey } from "@/lib/r2-storage";

export type PackagesProjectHost = "PR" | "AE";

export type PackagesProjectDto = {
  id: number;
  author_id: number;
  name: string;
  version: string | null;
  host: PackagesProjectHost;
  min_extension_version: string | null;
  min_host_version: string | null;
  details_url: string | null;
  previewUrl: string | null;
  previewKey: string | null;
  downloadKey: string | null;
  downloadUrl: string | null;
  price: number;
  visible: boolean;
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

function normalizeHost(raw: string | null | undefined): PackagesProjectHost {
  const v = (raw || "").trim().toUpperCase();
  if (v === "PR" || v === "PPRO" || v === "PREMIERE") return "PR";
  return "AE";
}

function rowToDto(row: RowDataPacket): PackagesProjectDto | null {
  if (row.deleted_at != null) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;

  const downloadKey =
    row.download_key == null || String(row.download_key).trim() === ""
      ? null
      : String(row.download_key).replace(/^\/+/, "");
  const previewKey =
    row.preview_key == null || String(row.preview_key).trim() === ""
      ? null
      : String(row.preview_key).replace(/^\/+/, "");

  let downloadUrl: string | null = null;
  if (downloadKey?.startsWith("public/")) {
    try {
      downloadUrl = r2PublicUrlForKey(downloadKey);
    } catch {
      downloadUrl = null;
    }
  }

  return {
    id,
    author_id: Number(row.author_id) || 0,
    name: String(row.name ?? ""),
    version:
      row.version == null || row.version === "" ? null : String(row.version),
    host: normalizeHost(String(row.host ?? "AE")),
    min_extension_version:
      row.min_extension_version == null || row.min_extension_version === ""
        ? null
        : String(row.min_extension_version),
    min_host_version:
      row.min_host_version == null || row.min_host_version === ""
        ? null
        : String(row.min_host_version),
    details_url:
      row.details_url == null || String(row.details_url).trim() === ""
        ? null
        : String(row.details_url).trim(),
    previewUrl: resolveMediaUrl(previewKey),
    previewKey,
    downloadKey,
    downloadUrl,
    price: Number(row.price) || 0,
    visible: Number(row.visible) === 1,
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

export async function assertPackagesAuthorId(
  authorId: number,
): Promise<PackagesAuthor> {
  const author = await getPackagesAuthorById(authorId);
  if (!author) throw new Error("UNKNOWN_AUTHOR");
  return author;
}

/** All non-deleted items for a packages author (any visibility). */
export async function listPackagesProjects(
  authorId: number,
): Promise<PackagesProjectDto[]> {
  await assertPackagesAuthorId(authorId);
  await ensurePackagesProjectsTable();
  const pool = getPool();
  const table = packagesProjectsTableName();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${table}\`
     WHERE author_id = ? AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 500`,
    [authorId],
  );
  return rows
    .map(rowToDto)
    .filter((p): p is PackagesProjectDto => p != null);
}

/** Visible CEP packs for an author (optional host filter). */
export async function listVisiblePackagesProjects(
  authorId: number,
  host?: PackagesProjectHost,
): Promise<PackagesProjectDto[]> {
  await ensurePackagesProjectsTable();
  const pool = getPool();
  const table = packagesProjectsTableName();
  const [rows] = host
    ? await pool.query<RowDataPacket[]>(
        `SELECT * FROM \`${table}\`
         WHERE author_id = ? AND visible = 1 AND deleted_at IS NULL AND host = ?
         ORDER BY id DESC
         LIMIT 500`,
        [authorId, host],
      )
    : await pool.query<RowDataPacket[]>(
        `SELECT * FROM \`${table}\`
         WHERE author_id = ? AND visible = 1 AND deleted_at IS NULL
         ORDER BY id DESC
         LIMIT 500`,
        [authorId],
      );
  return rows
    .map(rowToDto)
    .filter((p): p is PackagesProjectDto => p != null);
}

export async function getPackagesProject(
  authorId: number,
  itemId: number,
): Promise<PackagesProjectDto | null> {
  await assertPackagesAuthorId(authorId);
  await ensurePackagesProjectsTable();
  const pool = getPool();
  const table = packagesProjectsTableName();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${table}\`
     WHERE id = ? AND author_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [itemId, authorId],
  );
  return rows[0] ? rowToDto(rows[0]) : null;
}

export async function getPackagesProjectById(
  itemId: number,
): Promise<PackagesProjectDto | null> {
  await ensurePackagesProjectsTable();
  const pool = getPool();
  const table = packagesProjectsTableName();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${table}\`
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [itemId],
  );
  return rows[0] ? rowToDto(rows[0]) : null;
}

/** Soft-delete a packages project (`deleted_at`). Rows are never hard-deleted. */
export async function deletePackagesProject(
  authorId: number,
  itemId: number,
): Promise<void> {
  await assertPackagesAuthorId(authorId);
  await ensurePackagesProjectsTable();
  const pool = getPool();
  const table = packagesProjectsTableName();
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
  host?: PackagesProjectHost | string;
}): Promise<PackagesProjectDto> {
  const author = await assertPackagesAuthorId(opts.authorId);
  await ensurePackagesProjectsTable();
  const pool = getPool();
  const table = packagesProjectsTableName();
  const name = (opts.name?.trim() || "Untitled project").slice(0, 255);
  const version = opts.version?.trim() ? opts.version.trim().slice(0, 64) : null;
  const host =
    opts.host != null
      ? normalizeHost(String(opts.host))
      : author.slug === "premiere-gal"
        ? "PR"
        : "AE";

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO \`${table}\`
      (author_id, name, version, host, price, visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, NOW(), NOW())`,
    [opts.authorId, name, version, host],
  );

  const id = Number(result.insertId);
  const created = await getPackagesProject(opts.authorId, id);
  if (!created) throw new Error("CREATE_FAILED");
  return created;
}

/**
 * Duplicate a project for the other host (or an explicit host).
 * Copies metadata + preview; clears download zip (host builds usually differ)
 * and starts as hidden so CEP is not updated until reviewed.
 */
export async function clonePackagesProject(
  authorId: number,
  sourceId: number,
  opts?: { host?: PackagesProjectHost | string },
): Promise<PackagesProjectDto> {
  await assertPackagesAuthorId(authorId);
  await ensurePackagesProjectsTable();

  const source = await getPackagesProject(authorId, sourceId);
  if (!source) throw new Error("NOT_FOUND");

  const host =
    opts?.host != null
      ? normalizeHost(String(opts.host))
      : source.host === "PR"
        ? "AE"
        : "PR";

  const pool = getPool();
  const table = packagesProjectsTableName();
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO \`${table}\`
      (author_id, name, version, host,
       min_extension_version, min_host_version, details_url,
       preview_key, download_key, price, visible, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, NOW(), NOW())`,
    [
      authorId,
      source.name.slice(0, 255),
      source.version,
      host,
      source.min_extension_version,
      source.min_host_version,
      source.details_url,
      source.previewKey,
      source.price,
    ],
  );

  const id = Number(result.insertId);
  const created = await getPackagesProject(authorId, id);
  if (!created) throw new Error("CLONE_FAILED");
  return created;
}

export type PackagesProjectPatch = {
  name?: string;
  version?: string | null;
  host?: PackagesProjectHost | string;
  min_extension_version?: string | null;
  min_host_version?: string | null;
  details_url?: string | null;
  previewKeyOrUrl?: string | null;
  downloadKey?: string | null;
  price?: number;
  visible?: boolean;
};

export async function updatePackagesProject(
  authorId: number,
  itemId: number,
  patch: PackagesProjectPatch,
): Promise<PackagesProjectDto> {
  await assertPackagesAuthorId(authorId);
  await ensurePackagesProjectsTable();

  const existing = await getPackagesProject(authorId, itemId);
  if (!existing) throw new Error("NOT_FOUND");

  const name =
    patch.name !== undefined
      ? patch.name.trim().slice(0, 255) || existing.name
      : existing.name;
  const version =
    patch.version !== undefined
      ? patch.version?.trim()
        ? patch.version.trim().slice(0, 64)
        : null
      : existing.version;
  const host =
    patch.host !== undefined ? normalizeHost(String(patch.host)) : existing.host;
  const min_extension_version =
    patch.min_extension_version !== undefined
      ? patch.min_extension_version?.trim()
        ? patch.min_extension_version.trim().slice(0, 64)
        : null
      : existing.min_extension_version;
  const min_host_version =
    patch.min_host_version !== undefined
      ? patch.min_host_version?.trim()
        ? patch.min_host_version.trim().slice(0, 64)
        : null
      : existing.min_host_version;
  const details_url =
    patch.details_url !== undefined
      ? patch.details_url?.trim()
        ? patch.details_url.trim().slice(0, 1024)
        : null
      : existing.details_url;

  let preview_key = existing.previewKey;
  if (patch.previewKeyOrUrl !== undefined) {
    if (patch.previewKeyOrUrl == null || patch.previewKeyOrUrl === "") {
      preview_key = null;
    } else {
      preview_key = patch.previewKeyOrUrl.trim().replace(/^\/+/, "");
    }
  }

  let download_key = existing.downloadKey;
  if (patch.downloadKey !== undefined) {
    if (patch.downloadKey == null || patch.downloadKey === "") {
      download_key = null;
    } else {
      download_key = patch.downloadKey.trim().replace(/^\/+/, "");
    }
  }

  const price =
    patch.price !== undefined && Number.isFinite(patch.price)
      ? Math.max(0, Number(patch.price))
      : existing.price;
  const visible =
    patch.visible !== undefined ? (patch.visible ? 1 : 0) : existing.visible ? 1 : 0;

  const pool = getPool();
  const table = packagesProjectsTableName();
  await pool.query(
    `UPDATE \`${table}\`
     SET name = ?, version = ?, host = ?,
         min_extension_version = ?, min_host_version = ?, details_url = ?,
         preview_key = ?, download_key = ?, price = ?, visible = ?,
         updated_at = NOW()
     WHERE id = ? AND author_id = ? AND deleted_at IS NULL`,
    [
      name,
      version,
      host,
      min_extension_version,
      min_host_version,
      details_url,
      preview_key,
      download_key,
      price,
      visible,
      itemId,
      authorId,
    ],
  );

  const updated = await getPackagesProject(authorId, itemId);
  if (!updated) throw new Error("UPDATE_FAILED");
  return updated;
}

export function isDownloadKeyAllowedForAuthor(
  author: PackagesAuthor,
  key: string,
): boolean {
  const normalized = key.replace(/^\/+/, "");
  if (!normalized) return false;
  // Author bucket is the allowlist — any key from that bucket may be bound.
  if (author.r2Bucket?.trim()) return true;
  if (normalized.startsWith(`secure/packages/${author.id}/`)) return true;
  return false;
}

export function buildPackagesSecureObjectKey(
  authorId: number,
  projectId: number,
  filename: string,
): string {
  const stem =
    filename.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "_") ||
    `pack-${projectId}`;
  return `secure/packages/${authorId}/${projectId}/${stem}.zip`;
}
