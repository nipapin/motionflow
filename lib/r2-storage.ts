import "server-only";

import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 storage helpers.
 *
 * Required env vars (matches the names already in `.env`):
 *  - R2_ACCESS_KEY_ID      S3 API access key
 *  - R2_SECRET_ACCESS_KEY  S3 API secret
 *  - R2_PUBLIC_BUCKET      public bucket name (e.g. `motionflow-public`)
 *  - R2_PUBLIC_CDN         public base URL of the bucket (e.g. https://cdn.motionflow.pro)
 *
 * Endpoint resolution (one of):
 *  - R2_ENDPOINT           full S3 endpoint, e.g. https://{accountId}.r2.cloudflarestorage.com
 *  - R2_ACCOUNT_ID         used to build the endpoint when R2_ENDPOINT is not set
 *
 * Optional:
 *  - R2_REGION             defaults to `auto`
 *
 * @see https://developers.cloudflare.com/r2/api/s3/api/
 */

let cachedClient: S3Client | null = null;

function readEnv(name: string): string {
    const v = process.env[name];
    if (typeof v !== "string" || v.trim() === "") {
        throw new Error(
            `R2 storage is not configured: missing env ${name}. ` +
                `Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BUCKET, R2_PUBLIC_CDN ` +
                `(and R2_ENDPOINT or R2_ACCOUNT_ID).`,
        );
    }
    return v.trim();
}

function readEnvOptional(name: string): string | undefined {
    const v = process.env[name];
    if (typeof v !== "string" || v.trim() === "") return undefined;
    return v.trim();
}

export function getR2Bucket(): string {
    return readEnv("R2_PUBLIC_BUCKET");
}

export function getR2PublicBaseUrl(): string {
    return readEnv("R2_PUBLIC_CDN").replace(/\/+$/, "");
}

function getR2Endpoint(): string {
    const direct = readEnvOptional("R2_ENDPOINT");
    if (direct) return direct.replace(/\/+$/, "");
    const accountId = readEnv("R2_ACCOUNT_ID");
    return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function getR2Client(): S3Client {
    if (cachedClient) return cachedClient;

    const accessKeyId = readEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = readEnv("R2_SECRET_ACCESS_KEY");
    const region = readEnvOptional("R2_REGION") ?? "auto";

    cachedClient = new S3Client({
        region,
        endpoint: getR2Endpoint(),
        credentials: { accessKeyId, secretAccessKey },
        // R2 doesn't support some checksum headers AWS SDK adds by default
        forcePathStyle: false,
    });
    return cachedClient;
}

/** Build a `cdn.motionflow.pro/<key>` URL for a given object key. */
export function r2PublicUrlForKey(key: string): string {
    const base = getR2PublicBaseUrl();
    const encoded = key
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
    return `${base}/${encoded}`;
}

/** Inverse of {@link r2PublicUrlForKey}. Returns `null` if `url` isn't a public R2 URL for this bucket. */
export function r2KeyFromPublicUrl(url: string): string | null {
    let base: string;
    try {
        base = getR2PublicBaseUrl();
    } catch {
        return null;
    }
    if (!url.startsWith(`${base}/`)) return null;
    const encodedKey = url.slice(base.length + 1).split(/[?#]/)[0];
    try {
        return encodedKey
            .split("/")
            .map((seg) => decodeURIComponent(seg))
            .join("/");
    } catch {
        return null;
    }
}

const EXT_BY_MIME: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/ogg": "ogg",
    "audio/aac": "aac",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/L16": "pcm",
    "audio/pcm": "pcm",
};

/** Pick a sensible file extension from content-type, falling back to URL path. */
export function pickExtension(
    contentType: string | null | undefined,
    sourceUrl?: string,
): string {
    const ct = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (ct && EXT_BY_MIME[ct]) return EXT_BY_MIME[ct];
    if (sourceUrl) {
        try {
            const pathname = new URL(sourceUrl).pathname;
            const m = pathname.match(/\.([a-z0-9]{2,5})(?:$|\?)/i);
            if (m) return m[1].toLowerCase();
        } catch {
            /* ignore */
        }
    }
    return "bin";
}

export interface UploadToR2Options {
    /** Content-Type to store with the object. */
    contentType: string;
    /** Folder/key prefix, e.g. `image/{userId}` (no leading or trailing slash). */
    keyPrefix: string;
    /** Optional override file extension (without dot); otherwise inferred. */
    extension?: string;
    /** Optional override base name (UUID by default). */
    baseName?: string;
    /** Cache-Control header. Defaults to long-lived public cache. */
    cacheControl?: string;
}

export interface UploadToR2Result {
    key: string;
    url: string;
    contentType: string;
}

function shouldRetryStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRetryableTransferError(error: unknown): boolean {
    if (!error) return false;
    const text = error instanceof Error ? error.message : String(error);
    if (
        /terminated|econnreset|etimedout|econnaborted|socket hang up|und_err_|timeout|network/i.test(
            text,
        )
    ) {
        return true;
    }
    const cause = (error as { cause?: unknown }).cause as
        | { code?: string; message?: string }
        | undefined;
    const causeText = cause?.message ?? "";
    if (/econnreset|etimedout|und_err_/i.test(causeText)) return true;
    const code = cause?.code ?? (error as { code?: string }).code;
    if (typeof code === "string" && /ECONNRESET|ETIMEDOUT|EPIPE|UND_ERR_/i.test(code)) {
        return true;
    }
    const name = (error as { name?: string }).name;
    return name === "TimeoutError";
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function transferBackoffMs(attempt: number): number {
    return Math.min(30_000, 1_500 * 2 ** (attempt - 1));
}

/**
 * Upload bytes to R2 and return the public CDN URL.
 *
 * The bucket is expected to be public (or fronted by a Cloudflare Worker /
 * custom domain that exposes the objects), since the resulting URL is meant
 * to be embedded directly in `<img src>` / `<video src>`.
 */
export async function uploadBufferToR2(
    body: Buffer | Uint8Array,
    opts: UploadToR2Options,
): Promise<UploadToR2Result> {
    const client = getR2Client();
    const bucket = getR2Bucket();

    const ext = (opts.extension ?? pickExtension(opts.contentType)).replace(
        /^\.+/,
        "",
    );
    const base = opts.baseName ?? randomUUID();
    const prefix = opts.keyPrefix.replace(/^\/+|\/+$/g, "");
    const key = `${prefix}/${base}.${ext}`;

    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: opts.contentType,
            CacheControl: opts.cacheControl ?? "public, max-age=31536000, immutable",
        }),
    );

    return {
        key,
        url: r2PublicUrlForKey(key),
        contentType: opts.contentType,
    };
}

/**
 * Download a remote URL (optionally with Replicate auth) and store it in R2.
 *
 * Fully buffers the response before `PutObject`: streaming straight into the
 * S3 client is treated as a non-retryable request and surfaces confusing
 * `TimeoutError` / `ECONNRESET` on transient drops.
 *
 * Returns the public CDN URL.
 */
export async function uploadRemoteUrlToR2(
    sourceUrl: string,
    opts: {
        keyPrefix: string;
        /** Default content-type if upstream doesn't return one. */
        defaultContentType?: string;
        /** Extra request headers (e.g. `Authorization: Bearer ...`). */
        headers?: Record<string, string>;
        baseName?: string;
        cacheControl?: string;
    },
): Promise<UploadToR2Result> {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const res = await fetch(sourceUrl, {
                headers: opts.headers,
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => "");
                const msg = `Could not download source (${res.status}). ${detail.slice(0, 200)}`;
                if (attempt < maxAttempts && shouldRetryStatus(res.status)) {
                    await delay(transferBackoffMs(attempt));
                    continue;
                }
                throw new Error(msg);
            }

            const contentType =
                res.headers.get("content-type")?.split(";")[0]?.trim() ||
                opts.defaultContentType ||
                "application/octet-stream";

            const ext = pickExtension(contentType, sourceUrl);
            const buf = Buffer.from(await res.arrayBuffer());
            return uploadBufferToR2(buf, {
                contentType,
                keyPrefix: opts.keyPrefix,
                extension: ext,
                baseName: opts.baseName,
                cacheControl: opts.cacheControl,
            });
        } catch (error) {
            if (attempt < maxAttempts && isRetryableTransferError(error)) {
                await delay(transferBackoffMs(attempt));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Could not download source after retries.");
}
