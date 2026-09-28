import "server-only";

import type { RowDataPacket } from "mysql2";
import { getPool } from "@/lib/db";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";

const COLUMN = "showcase_prefix";
const MAX_LENGTH = 1024;

let columnEnsured = false;

export type ShowcasePrefixInput =
  | { ok: true; value: string | null }
  | { ok: false; error: "INVALID_PREFIX" };

type CountRow = RowDataPacket & { c: number };

/**
 * Canonical form of an operator-supplied R2 folder: `prefix/` in the public
 * bucket, or `s3://bucket/prefix/`. Empty input clears the field.
 *
 * `allowBucket` is false for contributor-facing forms — the media proxy serves
 * anything under the stored prefix, so only admins may point it at a bucket
 * other than the public one.
 */
export function normalizeShowcasePrefixInput(
  raw: string | null | undefined,
  opts: { allowBucket?: boolean } = {},
): ShowcasePrefixInput {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > MAX_LENGTH) return { ok: false, error: "INVALID_PREFIX" };
  if (/[\\\0]/.test(trimmed)) return { ok: false, error: "INVALID_PREFIX" };

  let bucket: string | null = null;
  let path = trimmed;

  const s3 = /^s3:\/\/([^/]+)\/?(.*)$/i.exec(trimmed);
  if (s3) {
    if (!opts.allowBucket) return { ok: false, error: "INVALID_PREFIX" };
    bucket = s3[1]!.trim();
    path = s3[2] ?? "";
    if (!/^[a-z0-9][a-z0-9._-]{1,62}$/i.test(bucket)) {
      return { ok: false, error: "INVALID_PREFIX" };
    }
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return { ok: false, error: "INVALID_PREFIX" };
  }

  const segments = path
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.some((s) => s === "." || s === "..")) {
    return { ok: false, error: "INVALID_PREFIX" };
  }
  if (segments.length === 0) return { ok: false, error: "INVALID_PREFIX" };

  const normalizedPath = `${segments.join("/")}/`;
  return {
    ok: true,
    value: bucket ? `s3://${bucket}/${normalizedPath}` : normalizedPath,
  };
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await getPool().execute<CountRow[]>(
    `SELECT COUNT(*) AS c
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?`,
    [table, column],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** `ADD COLUMN IF NOT EXISTS` is MySQL 8 only — emulate with information_schema. */
export async function ensureShowcasePrefixColumn(): Promise<void> {
  if (columnEnsured) return;
  const table = marketplaceItemsTable();
  if (!(await columnExists(table, COLUMN))) {
    await getPool().query(
      `ALTER TABLE \`${table}\`
         ADD COLUMN \`${COLUMN}\` VARCHAR(${MAX_LENGTH}) NULL`,
    );
  }
  columnEnsured = true;
}

export async function getItemShowcasePrefix(itemId: number): Promise<string | null> {
  if (!Number.isFinite(itemId) || itemId < 1) return null;
  const table = marketplaceItemsTable();
  try {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT \`${COLUMN}\` FROM \`${table}\` WHERE id = ? LIMIT 1`,
      [itemId],
    );
    const raw = rows[0]?.[COLUMN];
    if (raw == null) return null;
    const value = String(raw).trim();
    return value === "" ? null : value;
  } catch (err) {
    console.error("[showcase-prefix] read failed", err);
    return null;
  }
}

/** Write the normalized prefix, creating the column on first use. */
export async function setItemShowcasePrefix(
  itemId: number,
  value: string | null,
  opts: { authorId?: number } = {},
): Promise<void> {
  await ensureShowcasePrefixColumn();
  const table = marketplaceItemsTable();
  const params: Array<string | number | null> = [value, itemId];
  let sql = `UPDATE \`${table}\` SET \`${COLUMN}\` = ?, updated_at = NOW() WHERE id = ?`;
  if (opts.authorId != null) {
    sql += " AND author_id = ?";
    params.push(opts.authorId);
  }
  await getPool().execute(sql, params);
}
