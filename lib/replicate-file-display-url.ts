/**
 * Map a stored generation URL to a value safe to use in `<img src>` / `<video src>`.
 *
 * - Modern records store public CDN URLs (e.g. `https://cdn.notionflow.pro/...`)
 *   served from Cloudflare R2 — those are returned unchanged.
 * - Legacy records may still contain Replicate Files API URLs
 *   (`https://api.replicate.com/v1/files/{id}`) which require an `Authorization`
 *   header and therefore can't be used directly in `<img src>`. Those are
 *   rewritten to our same-origin `/api/replicate-files/[fileId]` proxy.
 */
export function replicateFileUrlToDisplaySrc(url: string): string {
    if (!url || typeof url !== "string") {
        return url;
    }
    if (url.startsWith("/api/replicate-files/")) {
        return url;
    }
    try {
        const u = new URL(url);
        if (
            u.hostname === "api.replicate.com" &&
            u.pathname.startsWith("/v1/files/")
        ) {
            const id = u.pathname.slice("/v1/files/".length).replace(/\/$/, "");
            if (id) {
                return `/api/replicate-files/${encodeURIComponent(id)}`;
            }
        }
    } catch {
        /* ignore invalid URL */
    }
    return url;
}
