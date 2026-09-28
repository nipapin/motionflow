/** Basename of download_key without `.zip` → R2 content prefix. */
export function resolvePackContentStem(
  downloadKey: string | null | undefined,
): string | null {
  if (!downloadKey) return null;
  const base = downloadKey.replace(/^\/+/, "").split("/").pop() || "";
  const stem = base.replace(/\.zip$/i, "").trim();
  return stem || null;
}

/**
 * Preview clips for a CEP pack live next to the zip contents:
 * `s3://{author bucket}/{zip name}/Previews/`.
 */
export function packShowcasePrefix(
  bucket: string | null | undefined,
  downloadKey: string | null | undefined,
): string | null {
  const stem = resolvePackContentStem(downloadKey);
  const name = bucket?.trim();
  if (!stem || !name) return null;
  return `s3://${name}/${stem}/Previews/`;
}
