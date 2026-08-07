import "server-only";

import { ListBucketsCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "@/lib/r2-storage";

/** Cloudflare R2 bucket names: letters, digits, dots, hyphens. */
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9._-]{1,62}$/i;

/**
 * Validate format of an author-assigned R2 bucket name.
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

/** List bucket names visible to the configured R2 API token (S3 ListBuckets). */
export async function listR2AccountBuckets(): Promise<string[]> {
  const client = getR2Client();
  const res = await client.send(new ListBucketsCommand({}));
  const names = (res.Buckets ?? [])
    .map((b) => b.Name?.trim())
    .filter((n): n is string => Boolean(n));
  names.sort((a, b) => a.localeCompare(b));
  return names;
}
