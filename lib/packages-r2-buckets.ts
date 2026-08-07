import "server-only";

/** Cloudflare R2 bucket names: letters, digits, dots, hyphens. */
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9._-]{1,62}$/i;

/**
 * Validate an author-assigned R2 bucket name (stored in DB, not from env).
 * Empty / null is allowed (bucket unset).
 */
export function normalizePackagesBucketName(
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, value: null };
  }
  const name = String(raw).trim();
  if (!BUCKET_NAME_RE.test(name)) {
    return {
      ok: false,
      error:
        "Invalid bucket name (use 3–63 chars: letters, digits, dots, hyphens)",
    };
  }
  return { ok: true, value: name };
}
