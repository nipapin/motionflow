import "server-only";
import { motionflowSiteOrigin } from "@/lib/motionflow-urls";

const BLOCKED_MIME = /^text\/html/i;

/**
 * Build headers for server-side fetch to motionflow.pro (or legacy domain).
 * Laravel may require a browser-like Origin, Referer, Cookie, and/or a shared internal key.
 */
export function buildUpstreamRequestHeaders(
  downloadUrl: string,
): Headers {
  const h = new Headers();
  h.set("User-Agent", "MotionflowNext/1.0 (marketplace download proxy)");
  h.set("Accept", "*/*");

  try {
    const origin = new URL(downloadUrl).origin;
    h.set("Origin", origin);
  } catch {
    h.set("Origin", motionflowSiteOrigin());
  }

  h.set("Referer", buildDefaultRefererForDownloadUrl(downloadUrl));

  const cookie =
    process.env.MOTIONFLOW_DOWNLOAD_UPSTREAM_COOKIE?.trim() ||
    process.env.MOTIONFLOW_DOWNLOAD_UPSTREAM_COOKIES?.trim();
  if (cookie) {
    h.set("Cookie", cookie);
    const xsrf = extractXsrfTokenFromCookieHeader(cookie);
    if (xsrf) {
      h.set("X-XSRF-TOKEN", decodeCookieValue(xsrf));
    }
  }

  const auth = process.env.MOTIONFLOW_DOWNLOAD_UPSTREAM_AUTHORIZATION?.trim();
  if (auth) {
    h.set("Authorization", auth);
  }

  const secret = process.env.MOTIONFLOW_INTERNAL_DOWNLOAD_KEY?.trim();
  if (secret) {
    h.set("X-Motionflow-Next-Key", secret);
  }

  const extra = process.env.MOTIONFLOW_DOWNLOAD_UPSTREAM_HEADERS?.trim();
  if (extra) {
    try {
      const o = JSON.parse(extra) as Record<string, string>;
      for (const [k, v] of Object.entries(o)) {
        if (k && v) h.set(k, v);
      }
    } catch {
      /* ignore invalid JSON */
    }
  }

  return h;
}

export function looksLikeHtmlErrorResponse(
  contentType: string | null,
  headSnippet: string,
): boolean {
  if (contentType && BLOCKED_MIME.test(contentType)) return true;
  const s = headSnippet.slice(0, 512).trimStart();
  if (s.startsWith("<!") || s.startsWith("<html") || s.toLowerCase().includes("unauthorized")) {
    return true;
  }
  return false;
}

export function buildAttachmentFilename(
  productName: string,
  itemId: number,
  upstreamContentDisposition: string | null,
): string {
  const fromUpstream = parseFilenameFromContentDisposition(
    upstreamContentDisposition,
  );
  if (fromUpstream) return sanitizeFilename(fromUpstream);
  return sanitizeFilename(`${productName || `item-${itemId}`}.zip`) || `item-${itemId}.zip`;
}

/**
 * Use item page (…/item/slug/123) as Referer, not site root; overrides via MOTIONFLOW_DOWNLOAD_UPSTREAM_REFERER.
 */
function buildDefaultRefererForDownloadUrl(downloadUrl: string): string {
  const override = process.env.MOTIONFLOW_DOWNLOAD_UPSTREAM_REFERER?.trim();
  if (override) return override;
  try {
    const u = new URL(downloadUrl);
    if (u.pathname.endsWith("/download") || u.pathname.endsWith("/download/")) {
      u.pathname = u.pathname.replace(/\/download\/?$/, "/");
    }
    return u.toString();
  } catch {
    return `${motionflowSiteOrigin()}/`;
  }
}

function extractXsrfTokenFromCookieHeader(cookie: string): string | null {
  const m = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/i.exec(cookie);
  return m ? m[1].trim() : null;
}

function decodeCookieValue(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function parseFilenameFromContentDisposition(
  value: string | null,
): string | null {
  if (!value) return null;
  const mStar = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(value);
  if (mStar) {
    try {
      return decodeURIComponent(mStar[1].trim().replace(/["']/g, ""));
    } catch {
      return mStar[1].trim();
    }
  }
  const m = /filename\s*=\s*("?)([^";\n]+)\1?/i.exec(value);
  return m ? m[2].trim() : null;
}

function sanitizeFilename(name: string): string {
  const s = name.replace(/[/\\?*:|"<>]/g, "-").replace(/\s+/g, " ").trim();
  return s || "download.zip";
}
