/**
 * Same-origin URL for browser `<audio>` / `new Audio()` when the file lives on
 * our public CDN. Avoids Chrome blocking cross-origin media when the CDN
 * connection fails Private Network Access / address-space checks.
 */
const PROXYABLE_HOSTS = new Set<string>([
  "cdn.motionflow.pro",
  "cdn.notionflow.pro",
]);

function addHostFromEnv(varName: string) {
  const raw = process.env[varName];
  if (typeof raw !== "string" || !raw.trim()) return;
  try {
    PROXYABLE_HOSTS.add(new URL(raw).hostname);
  } catch {
    const host = raw.replace(/^https?:\/\//, "").replace(/\/$/, "").trim();
    if (host) PROXYABLE_HOSTS.add(host);
  }
}

addHostFromEnv("NEXT_PUBLIC_MOTIONFLOW_CDN");
addHostFromEnv("NEXT_PUBLIC_R2_PUBLIC_CDN");

export function sameOriginAudioSrc(audioUrl: string): string {
  if (
    !audioUrl ||
    audioUrl.startsWith("/") ||
    audioUrl.startsWith("blob:") ||
    audioUrl.startsWith("data:") ||
    audioUrl.startsWith("/api/audio-proxy")
  ) {
    return audioUrl;
  }
  try {
    const { hostname } = new URL(audioUrl);
    if (!PROXYABLE_HOSTS.has(hostname)) return audioUrl;
    return `/api/audio-proxy?url=${encodeURIComponent(audioUrl)}`;
  } catch {
    return audioUrl;
  }
}
