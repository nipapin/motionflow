import "server-only";

import type { NextRequest } from "next/server";
import {
  getPackagesAuthorRow,
  listPackagesAuthorRows,
  type PackagesAuthorRow,
} from "@/lib/packages-authors-db";

const DEFAULT_PACKAGES_ADMIN_EMAILS = ["basepackagehelp@gmail.com"] as const;

export type PackagesAuthorSlug = string;

export type PackagesAuthor = {
  id: number;
  slug: PackagesAuthorSlug;
  label: string;
  /** R2 bucket for this author's packs; null = not configured. */
  r2Bucket: string | null;
};

function rowToPackagesAuthor(row: PackagesAuthorRow): PackagesAuthor {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    r2Bucket: row.r2_bucket,
  };
}

export function packagesAdminEmails(): Set<string> {
  const set = new Set<string>(DEFAULT_PACKAGES_ADMIN_EMAILS.map((e) => e.toLowerCase()));
  const fromEnv = process.env.PACKAGES_ADMIN_EMAILS?.trim();
  if (fromEnv) {
    for (const part of fromEnv.split(",")) {
      const e = part.trim().toLowerCase();
      if (e) set.add(e);
    }
  }
  return set;
}

export function isPackagesAdmin(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return packagesAdminEmails().has(email.trim().toLowerCase());
}

export async function listPackagesAuthors(): Promise<PackagesAuthor[]> {
  const rows = await listPackagesAuthorRows();
  return rows.map(rowToPackagesAuthor);
}

export async function getPackagesAuthorBySlug(
  slug: string | null | undefined,
): Promise<PackagesAuthor | null> {
  if (!slug) return null;
  const s = slug.trim().toLowerCase();
  const authors = await listPackagesAuthors();
  return authors.find((a) => a.slug === s) ?? null;
}

export async function getPackagesAuthorById(
  id: number,
): Promise<PackagesAuthor | null> {
  const row = await getPackagesAuthorRow(id);
  return row ? rowToPackagesAuthor(row) : null;
}

/** Any object key is allowed once the author has a configured bucket. */
export function isKeyAllowedForAuthor(
  author: PackagesAuthor,
  key: string,
): boolean {
  if (!author.r2Bucket?.trim()) return false;
  return Boolean(key.replace(/^\/+/, ""));
}

/**
 * R2Sync desktop (superadmin-only app): no user login.
 * Protects endpoints with a shared secret from app config.
 */
export function assertR2SyncAdmin(
  req: NextRequest | Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.R2SYNC_ADMIN_SECRET?.trim();
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, status: 503, error: "R2SYNC_ADMIN_SECRET not configured" };
    }
    return { ok: true };
  }
  const header =
    req.headers.get("x-r2sync-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  if (header !== expected) {
    return { ok: false, status: 401, error: "Invalid R2Sync secret" };
  }
  return { ok: true };
}
