import "server-only";

import { uploadRemoteUrlToR2 } from "@/lib/r2-storage";

/**
 * Replicate `replicate.delivery/...` URLs from model output expire (typically ~1 hour).
 * Re-host them in our public R2 bucket so the CDN URL we persist in the DB stays
 * valid forever.
 *
 * @see https://replicate.com/docs/topics/predictions/output-files
 */

function buildReplicateAuthHeaders(): Record<string, string> | undefined {
    const token = process.env.REPLICATE_API_TOKEN;
    if (typeof token !== "string" || token === "") return undefined;
    return { Authorization: `Bearer ${token}` };
}

interface MirrorOptions {
    /** Folder to store the file under, e.g. `image/{userId}` or `video/{userId}`. */
    keyPrefix: string;
    /** Default content-type if upstream omits it. */
    defaultContentType?: string;
}

/**
 * Mirror a list of Replicate delivery URLs to R2.
 * Returns the public CDN URLs in the same order.
 */
export async function mirrorReplicateUrlsToR2(
    deliveryUrls: string[],
    opts: MirrorOptions,
): Promise<string[]> {
    const authHeaders = buildReplicateAuthHeaders();
    const out: string[] = [];

    for (const url of deliveryUrls) {
        const result = await uploadRemoteUrlToR2(url, {
            keyPrefix: opts.keyPrefix,
            defaultContentType: opts.defaultContentType,
            headers: authHeaders,
        });
        out.push(result.url);
    }

    return out;
}

/**
 * Convenience wrapper for image outputs.
 * @deprecated use `mirrorReplicateUrlsToR2` directly with a per-user `keyPrefix`.
 */
export async function mirrorReplicateDeliveryImageUrls(
    deliveryUrls: string[],
    keyPrefix = "image/anonymous",
): Promise<string[]> {
    return mirrorReplicateUrlsToR2(deliveryUrls, {
        keyPrefix,
        defaultContentType: "image/png",
    });
}
