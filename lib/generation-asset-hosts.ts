function addCdnHostFromEnv(varName: string, set: Set<string>) {
  const raw = process.env[varName];
  if (typeof raw !== "string" || !raw.trim()) return;
  const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "").trim();
  if (host) set.add(host);
}

/**
 * Hostnames where we persist or temporarily host AI generation media.
 * Used by `/api/download-generation-asset` (server) and `downloadUrlAsFile` (client).
 */
export function generationAssetAllowedHostnames(): string[] {
  const set = new Set<string>(["cdn.motionflow.pro", "cdn.notionflow.pro"]);
  addCdnHostFromEnv("NEXT_PUBLIC_MOTIONFLOW_CDN", set);
  addCdnHostFromEnv("R2_PUBLIC_CDN", set);
  return [...set].filter(Boolean);
}

export function isAllowedGenerationAssetHostname(hostname: string): boolean {
  if (generationAssetAllowedHostnames().includes(hostname)) return true;
  if (hostname === "replicate.delivery" || hostname.endsWith(".replicate.delivery"))
    return true;
  return false;
}

export function isAllowedGenerationAssetUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    return isAllowedGenerationAssetHostname(u.hostname);
  } catch {
    return false;
  }
}

export function safeAttachmentFilename(raw: string | null): string {
  const base =
    (raw?.trim() || "download").split(/[/\\]/).pop() ?? "download";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
  return cleaned || "download";
}
