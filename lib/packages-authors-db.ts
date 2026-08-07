import "server-only";

import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

const AUTHORS_TABLE = "packages_authors";
const PROJECTS_TABLE = "packages_projects";

let authorsTableEnsured = false;
let projectsTableEnsured = false;
let authorsSeeded = false;

export type PackagesAuthorHost = "PR" | "AE";

export type PackagesAuthorRow = {
  id: number;
  slug: string;
  label: string;
  r2_bucket: string | null;
  r2_prefix: string;
  demo_pr_key: string | null;
  demo_ae_key: string | null;
  demo_pr_version: string | null;
  demo_ae_version: string | null;
  created_at: string;
  updated_at: string;
};

const SEED_AUTHORS: Array<{
  id: number;
  slug: string;
  label: string;
  r2_prefix: string;
}> = [
  {
    id: PREMIERE_GAL_AUTHOR_ID,
    slug: "premiere-gal",
    label: "Premiere Gal",
    r2_prefix: "public/downloads/galtoolkit/",
  },
  {
    id: SPUNKRAM_AUTHOR_ID,
    slug: "spunkram",
    label: "Spunkram",
    r2_prefix: "public/downloads/spunkram/",
  },
];

export async function ensurePackagesAuthorsTable(): Promise<void> {
  if (authorsTableEnsured) return;
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${AUTHORS_TABLE}\` (
       id INT UNSIGNED NOT NULL,
       slug VARCHAR(64) NOT NULL,
       label VARCHAR(255) NOT NULL,
       r2_bucket VARCHAR(255) NULL,
       r2_prefix VARCHAR(512) NOT NULL,
       demo_pr_key VARCHAR(512) NULL,
       demo_ae_key VARCHAR(512) NULL,
       demo_pr_version VARCHAR(64) NULL,
       demo_ae_version VARCHAR(64) NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uq_packages_authors_slug (slug)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  authorsTableEnsured = true;
}

export async function ensurePackagesProjectsTable(): Promise<void> {
  if (projectsTableEnsured) return;
  await ensurePackagesAuthorsTable();
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS \`${PROJECTS_TABLE}\` (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       author_id INT UNSIGNED NOT NULL,
       name VARCHAR(255) NOT NULL,
       version VARCHAR(64) NULL,
       host VARCHAR(8) NOT NULL DEFAULT 'AE',
       min_extension_version VARCHAR(64) NULL,
       min_host_version VARCHAR(64) NULL,
       details_url VARCHAR(1024) NULL,
       preview_key VARCHAR(512) NULL,
       download_key VARCHAR(512) NULL,
       price DECIMAL(12,2) NOT NULL DEFAULT 0,
       visible TINYINT(1) NOT NULL DEFAULT 0,
       deleted_at DATETIME NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       KEY idx_packages_projects_author (author_id, deleted_at),
       KEY idx_packages_projects_visible (author_id, visible, host, deleted_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  projectsTableEnsured = true;
}

export async function seedPackagesAuthors(): Promise<void> {
  if (authorsSeeded) return;
  await ensurePackagesAuthorsTable();
  const pool = getPool();
  for (const a of SEED_AUTHORS) {
    await pool.query(
      `INSERT INTO \`${AUTHORS_TABLE}\`
         (id, slug, label, r2_bucket, r2_prefix)
       VALUES (?, ?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE
         slug = VALUES(slug)`,
      [a.id, a.slug, a.label, a.r2_prefix],
    );
  }
  authorsSeeded = true;
}

function rowToAuthor(row: RowDataPacket): PackagesAuthorRow {
  return {
    id: Number(row.id),
    slug: String(row.slug ?? ""),
    label: String(row.label ?? ""),
    r2_bucket:
      row.r2_bucket == null || String(row.r2_bucket).trim() === ""
        ? null
        : String(row.r2_bucket).trim(),
    r2_prefix: String(row.r2_prefix ?? "").replace(/^\/+/, ""),
    demo_pr_key: row.demo_pr_key == null ? null : String(row.demo_pr_key),
    demo_ae_key: row.demo_ae_key == null ? null : String(row.demo_ae_key),
    demo_pr_version:
      row.demo_pr_version == null ? null : String(row.demo_pr_version),
    demo_ae_version:
      row.demo_ae_version == null ? null : String(row.demo_ae_version),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ""),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? ""),
  };
}

export async function listPackagesAuthorRows(): Promise<PackagesAuthorRow[]> {
  await seedPackagesAuthors();
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${AUTHORS_TABLE}\` ORDER BY label ASC`,
  );
  return rows.map(rowToAuthor);
}

export async function getPackagesAuthorRow(
  id: number,
): Promise<PackagesAuthorRow | null> {
  await seedPackagesAuthors();
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM \`${AUTHORS_TABLE}\` WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? rowToAuthor(rows[0]) : null;
}

export type PackagesAuthorPatch = {
  label?: string;
  r2_bucket?: string | null;
};

export async function updatePackagesAuthorRow(
  id: number,
  patch: PackagesAuthorPatch,
): Promise<PackagesAuthorRow> {
  const existing = await getPackagesAuthorRow(id);
  if (!existing) throw new Error("NOT_FOUND");

  const label =
    patch.label !== undefined
      ? patch.label.trim().slice(0, 255) || existing.label
      : existing.label;
  const r2_bucket =
    patch.r2_bucket !== undefined
      ? patch.r2_bucket?.trim()
        ? patch.r2_bucket.trim().slice(0, 255)
        : null
      : existing.r2_bucket;

  const pool = getPool();
  await pool.query<ResultSetHeader>(
    `UPDATE \`${AUTHORS_TABLE}\`
     SET label = ?, r2_bucket = ?, updated_at = NOW()
     WHERE id = ?`,
    [label, r2_bucket, id],
  );

  const updated = await getPackagesAuthorRow(id);
  if (!updated) throw new Error("UPDATE_FAILED");
  return updated;
}

export function packagesAuthorsTableName(): string {
  return AUTHORS_TABLE;
}

export function packagesProjectsTableName(): string {
  return PROJECTS_TABLE;
}
