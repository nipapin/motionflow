import "server-only";

import type Replicate from "replicate";

/**
 * Replicate `replicate.delivery/...` URLs from model output expire (typically ~1 hour).
 * Re-upload bytes via the Files API so we persist `urls.get` instead of ephemeral links.
 * @see https://replicate.com/docs/topics/predictions/output-files
 */
export async function mirrorReplicateDeliveryImageUrls(
    client: Replicate,
    deliveryUrls: string[],
): Promise<string[]> {
    const hosted: string[] = [];

    for (const deliveryUrl of deliveryUrls) {
        const res = await fetch(deliveryUrl);
        if (!res.ok) {
            throw new Error(
                `Could not download model output (${res.status}). The link may have expired; try generating again.`,
            );
        }

        const type =
            res.headers.get("content-type")?.split(";")[0]?.trim() ||
            "image/png";
        const buf = Buffer.from(await res.arrayBuffer());
        const blob = new Blob([buf], { type });

        const created = await client.files.create(blob);
        const url = created.urls?.get;
        if (typeof url !== "string" || !url) {
            console.error(
                "[replicate-mirror-output] missing urls.get in files.create",
                created,
            );
            throw new Error("Could not persist generated image. Please try again.");
        }
        hosted.push(url);
    }

    return hosted;
}
