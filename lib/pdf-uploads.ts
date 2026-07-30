import "server-only";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db";

const TABLE = "pdf_uploads";

let tableEnsured = false;

async function ensureTable(): Promise<void> {
    if (tableEnsured) return;
    const pool = getPool();
    await pool.query(
        `CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       user_id BIGINT UNSIGNED NOT NULL,
       r2_key VARCHAR(512) NOT NULL,
       url VARCHAR(1024) NOT NULL,
       filename VARCHAR(255) NOT NULL,
       size BIGINT UNSIGNED NOT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (id),
       UNIQUE KEY uniq_r2_key (r2_key),
       KEY idx_user_updated (user_id, updated_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    );
    tableEnsured = true;
}

export interface PdfUploadRow {
    id: string;
    url: string;
    filename: string;
    size: number;
    created_at: string;
    updated_at: string;
}

type RawRow = RowDataPacket & {
    id: string | number | bigint;
    url: string;
    filename: string;
    size: string | number;
    created_at: Date | string;
    updated_at: Date | string;
};

function formatDate(v: Date | string): string {
    return v instanceof Date ? v.toISOString() : String(v);
}

function parseRow(r: RawRow): PdfUploadRow {
    return {
        id: String(r.id),
        url: r.url,
        filename: r.filename,
        size: Number(r.size),
        created_at: formatDate(r.created_at),
        updated_at: formatDate(r.updated_at),
    };
}

export interface UpsertPdfUploadInput {
    userId: number;
    key: string;
    url: string;
    filename: string;
    size: number;
}

/**
 * Insert a new row for a fresh upload, or — when `key` already belongs to this
 * user (a "replace in place") — update filename/size/url and bump `updated_at`.
 * Returns the row id either way.
 */
export async function upsertPdfUpload(input: UpsertPdfUploadInput): Promise<string> {
    await ensureTable();
    const pool = getPool();
    const [header] = await pool.execute<ResultSetHeader>(
        `INSERT INTO \`${TABLE}\` (user_id, r2_key, url, filename, size)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       id = LAST_INSERT_ID(id),
       filename = VALUES(filename),
       size = VALUES(size),
       url = VALUES(url),
       updated_at = CURRENT_TIMESTAMP`,
        [input.userId, input.key, input.url, input.filename, input.size],
    );
    return String(header.insertId);
}

export async function listPdfUploads(userId: number, limit = 200): Promise<PdfUploadRow[]> {
    await ensureTable();
    const pool = getPool();
    const safeLimit = Math.min(Math.max(limit, 1), 500);
    const [rows] = await pool.execute<RawRow[]>(
        `SELECT id, url, filename, size, created_at, updated_at
     FROM \`${TABLE}\`
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ${safeLimit}`,
        [userId],
    );
    return rows.map(parseRow);
}

/**
 * Deletes the row (only if owned by `userId`) and returns its R2 key so the
 * caller can also remove the underlying object. Returns `null` if not found.
 */
export async function deletePdfUpload(userId: number, id: string): Promise<string | null> {
    await ensureTable();
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) return null;

    const pool = getPool();
    const [rows] = await pool.execute<(RowDataPacket & { r2_key: string })[]>(
        `SELECT r2_key FROM \`${TABLE}\` WHERE id = ? AND user_id = ? LIMIT 1`,
        [numericId, userId],
    );
    const key = rows[0]?.r2_key ?? null;
    if (!key) return null;

    await pool.execute<ResultSetHeader>(
        `DELETE FROM \`${TABLE}\` WHERE id = ? AND user_id = ?`,
        [numericId, userId],
    );
    return key;
}
