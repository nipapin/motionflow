import "server-only";

import type { NextRequest } from "next/server";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

const DEFAULT_PACKAGES_ADMIN_EMAILS = ["basepackagehelp@gmail.com"] as const;

export type PackagesAuthorSlug = "premiere-gal" | "spunkram";

export type PackagesAuthor = {
  id: number;
  slug: PackagesAuthorSlug;
  label: string;
  r2Prefixes: string[];
};

export const PACKAGES_AUTHORS: PackagesAuthor[] = [
  {
    id: PREMIERE_GAL_AUTHOR_ID,
    slug: "premiere-gal",
    label: "Premiere Gal",
    r2Prefixes: ["public/downloads/galtoolkit/"],
  },
  {
    id: SPUNKRAM_AUTHOR_ID,
    slug: "spunkram",
    label: "Spunkram",
    r2Prefixes: ["public/downloads/spunkram/"],
  },
];

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

export function getPackagesAuthorBySlug(slug: string | null | undefined): PackagesAuthor | null {
  if (!slug) return null;
  const s = slug.trim().toLowerCase();
  return PACKAGES_AUTHORS.find((a) => a.slug === s) ?? null;
}

export function getPackagesAuthorById(id: number): PackagesAuthor | null {
  return PACKAGES_AUTHORS.find((a) => a.id === id) ?? null;
}

/** Key must sit under one of the author's allowed prefixes. */
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
