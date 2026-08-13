import { motionflowSiteOrigin } from "@/lib/motionflow-urls";

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local")
  );
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    return isLoopbackHostname(new URL(origin).hostname);
  } catch {
    return true;
  }
}

/** Public Next origin for links in email. Never embed localhost. */
export function resolveMailSiteOrigin(siteOrigin?: string): string {
  const configured = motionflowSiteOrigin().replace(/\/$/, "");
  if (!siteOrigin?.trim()) return configured;
  const candidate = siteOrigin.trim().replace(/\/$/, "");
  if (isLoopbackOrigin(candidate)) return configured;
  return candidate;
}

export function mailSiteOriginFromHeaders(headers: Headers): string {
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers.get("host")?.trim();
  if (!host) return resolveMailSiteOrigin();
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (host.includes("localhost") ? "http" : "https");
  return resolveMailSiteOrigin(`${proto}://${host}`);
}
