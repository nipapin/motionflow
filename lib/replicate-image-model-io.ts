import "server-only";

import type { FileOutput } from "replicate";

/** Browser proxy paths must be turned into Replicate Files API URLs for model input. */
export function normalizeImageUrlForReplicate(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith("/api/replicate-files/")) {
        const id = trimmed
            .slice("/api/replicate-files/".length)
            .replace(/\/$/, "");
        if (id) {
            return `https://api.replicate.com/v1/files/${decodeURIComponent(id)}`;
        }
    }
    try {
        const u = new URL(trimmed);
        if (u.pathname.startsWith("/api/replicate-files/")) {
            const id = u.pathname
                .slice("/api/replicate-files/".length)
                .replace(/\/$/, "");
            if (id) {
                return `https://api.replicate.com/v1/files/${decodeURIComponent(id)}`;
            }
        }
    } catch {
        /* ignore */
    }
    return trimmed;
}

export function isAllowedSourceImageUrl(value: string): boolean {
    const t = value.trim();
    if (t.startsWith("/api/replicate-files/")) {
        return t.length > "/api/replicate-files/".length;
    }
    try {
        const u = new URL(t);
        if (u.pathname.startsWith("/api/replicate-files/")) {
            return u.pathname.length > "/api/replicate-files/".length;
        }
        return u.protocol === "https:" || u.protocol === "http:";
    } catch {
        return false;
    }
}

export function extractUrlsFromReplicateOutput(output: unknown): string[] {
    if (typeof output === "string" && /^https?:\/\//i.test(output.trim())) {
        return [output.trim()];
    }
    const items = Array.isArray(output) ? output : output != null ? [output] : [];
    const urls: string[] = [];
    for (const item of items) {
        if (typeof item === "string" && /^https?:\/\//i.test(item.trim())) {
            urls.push(item.trim());
            continue;
        }
        if (item && typeof item === "object" && "url" in item) {
            try {
                const fo = item as FileOutput;
                const u = fo.url();
                const s = typeof u === "string" ? u : u?.toString();
                if (s) urls.push(s);
            } catch {
                /* ignore */
            }
        }
    }
    return urls;
}

export function mapReplicateModelError(
    error: unknown,
    genericFallback: string,
): { status: number; message: string } {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const statusMatch = raw.match(/status\s+(\d{3})/i);
    const status = statusMatch ? Number(statusMatch[1]) : 500;

    if (status === 401 || status === 403) {
        return {
            status: 503,
            message:
                "The image service is temporarily unavailable. Please try again later.",
        };
    }

    if (status === 402 || /insufficient credit/i.test(raw)) {
        return {
            status: 503,
            message:
                "The image service is temporarily unavailable. Please try again later or contact support.",
        };
    }

    if (status === 429 || /rate.?limit/i.test(raw)) {
        return {
            status: 429,
            message: "Too many requests right now. Please wait a moment and try again.",
        };
    }

    if (status === 422 || /nsfw|safety|sensitive/i.test(raw)) {
        return {
            status: 400,
            message:
                "Your request couldn't be processed. Try a different image or settings.",
        };
    }

    if (status >= 500 && status < 600) {
        return {
            status: 503,
            message:
                "The image service is having issues right now. Please try again shortly.",
        };
    }

    return { status: 500, message: genericFallback };
}
