import "server-only";

/**
 * Buckets selectable for Packages authors.
 * Sources (deduped, order preserved):
 *  - R2_PUBLIC_BUCKET
 *  - R2_BUCKET (private)
 *  - AWS_BUCKET
 *  - R2_PREMIEREGAL_BUCKET
 *  - PACKAGES_R2_BUCKETS (comma-separated extras, e.g. spunkram-library)
 */
export function listAvailablePackagesBuckets(): string[] {
  const raw = [
    process.env.R2_PUBLIC_BUCKET,
    process.env.R2_BUCKET,
    process.env.AWS_BUCKET,
    process.env.R2_PREMIEREGAL_BUCKET,
    ...(process.env.PACKAGES_R2_BUCKETS ?? "").split(","),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw) {
    const name = part?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function isPackagesBucketAllowed(
  bucket: string | null | undefined,
  extraAllowed: string[] = [],
): boolean {
  if (!bucket?.trim()) return true; // empty = unset
  const name = bucket.trim();
  if (listAvailablePackagesBuckets().includes(name)) return true;
  return extraAllowed.includes(name);
}
