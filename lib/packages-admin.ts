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
  /** Empty / null → use default public/private env buckets. */
  r2Bucket: string | null;
  /** Single allowlisted prefix (normalized with trailing slash). */
  r2Prefix: string;
  /** Compatibility: always `[r2Prefix]`. */
  r2Prefixes: string[];
  demoPrKey: string | null;
  demoAeKey: string | null;
  demoPrVersion: string | null;
  demoAeVersion: string | null;
};

function rowToPackagesAuthor(row: PackagesAuthorRow): PackagesAuthor {
  const r2Prefix = row.r2_prefix.endsWith("/")
    ? row.r2_prefix
    : `${row.r2_prefix}/`;
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    r2Bucket: row.r2_bucket,
    r2Prefix,
    r2Prefixes: [r2Prefix],
    demoPrKey: row.demo_pr_key,
    demoAeKey: row.demo_ae_key,
    demoPrVersion: row.demo_pr_version,
    demoAeVersion: row.demo_ae_version,
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

/** Key must sit under the author's allowed prefix. */
export function isKeyAllowedForAuthor(author: PackagesAuthor, key: string): boolean {
  const normalized = key.replace(/^\/+/, "");
  return author.r2Prefixes.some((p) => normalized.startsWith(p));
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
