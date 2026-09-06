import "server-only";

import { createHash } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client } from "@/lib/r2-storage";
import { motionflowSiteOrigin } from "@/lib/motionflow-urls";

/** Presigned GET TTL for Gal Toolkit project / _Assets files. */
export const GAL_EFFECTS_FILE_PRESIGN_TTL_SECONDS = 10 * 60;

/** Private R2 bucket holding Gal Toolkit Max pack tree (JSON + Assets). */
export function galToolkitBucket(): string {
  return process.env.R2_GAL_TOOLKIT_BUCKET?.trim() || "gal-toolkit-max";
}

/** Host folder under the bucket (`premiere-pro` | `after-effects`). */
export type GalEffectsHost = "PR" | "AE";

const HOST_PREFIX: Record<GalEffectsHost, string> = {
  PR: "premiere-pro",
  AE: "after-effects",
};

const HOST_JSON: Record<GalEffectsHost, string> = {
  PR: "Premiere Pro.json",
  AE: "After Effects.json",
};

export function galEffectsPrefix(host: GalEffectsHost = "PR"): string {
  return HOST_PREFIX[host];
}

export function galEffectsJsonKey(host: GalEffectsHost = "PR"): string {
  return `${HOST_PREFIX[host]}/${HOST_JSON[host]}`;
}

export function galEffectsAssetsPrefix(host: GalEffectsHost = "PR"): string {
  return `${HOST_PREFIX[host]}/Assets/`;
}

/** Host-root file list: `premiere-pro/manifest.json` / `after-effects/manifest.json`. */
export function galEffectsManifestKey(host: GalEffectsHost = "PR"): string {
  return `${HOST_PREFIX[host]}/manifest.json`;
}

const MIME_BY_EXT: Record<string, string> = {
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
};

function extname(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

export function mimeForGalEffectsKey(key: string): string {
  return MIME_BY_EXT[extname(key)] ?? "application/octet-stream";
}

type PackJsonBody = {
  settings?: unknown;
  content?: unknown;
  contents?: unknown;
  structure?: unknown;
};

function normalizePackBody(raw: string): {
  settings: Record<string, unknown>;
  content: Record<string, unknown>;
} | null {
  let parsed: PackJsonBody;
  try {
    parsed = JSON.parse(raw) as PackJsonBody;
  } catch {
    return null;
  }
  const settings =
    parsed.settings && typeof parsed.settings === "object"
      ? (parsed.settings as Record<string, unknown>)
      : null;
  const contentRaw = parsed.content ?? parsed.contents ?? parsed.structure;
  const content =
    contentRaw && typeof contentRaw === "object"
      ? (contentRaw as Record<string, unknown>)
      : null;
  if (!settings || !content) return null;
  return { settings, content };
}

export type GalEffectsCatalog = {
  host: GalEffectsHost;
  pack_name: string;
  version: string;
  etag: string;
  settings: Record<string, unknown>;
  content: Record<string, unknown>;
  /** Absolute base for Assets proxy: …/api/cep/gal/effects/media */
  assets_base_url: string;
};

type CachedCatalog = { data: GalEffectsCatalog; expiresAt: number };
const catalogCache = new Map<string, CachedCatalog>();
const CATALOG_TTL_MS = 60_000;

async function getR2ObjectText(
  bucket: string,
  key: string,
): Promise<string | null> {
  const client = getR2Client();
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) return null;
    return await res.Body.transformToString();
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    const status = (err as { $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata?.httpStatusCode;
    if (name === "NoSuchKey" || name === "NotFound" || status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Absolute media base used by CEP: append `/Category/Folder/stem.png`.
 * Optional `?host=AE` for After Effects assets.
 */
export function galEffectsMediaBaseUrl(_host: GalEffectsHost = "PR"): string {
  return `${motionflowSiteOrigin()}/api/cep/gal/effects/media`;
}

/** Resolve URL path segments → full R2 key under `{prefix}/Assets/`, or null. */
export function resolveGalEffectsAssetKey(
  pathSegments: string[],
  host: GalEffectsHost = "PR",
): string | null {
  const parts = pathSegments
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    })
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== "." && p !== "..");

  if (parts.length === 0) return null;
  if (parts.some((p) => p.includes("\\") || p.includes("\0"))) return null;

  return `${galEffectsAssetsPrefix(host)}${parts.join("/")}`;
}

export type GalEffectsMediaObject = {
  key: string;
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | undefined;
  contentRange: string | undefined;
  acceptRanges: string;
  status: number;
};

/** Stream an Assets object from the Gal Toolkit bucket (supports HTTP Range). */
export async function getGalEffectsAssetStream(
  key: string,
  rangeHeader: string | null,
  host: GalEffectsHost = "PR",
): Promise<GalEffectsMediaObject | null> {
  const prefix = galEffectsAssetsPrefix(host);
  if (!key.startsWith(prefix)) return null;

  const client = getR2Client();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: galToolkitBucket(),
        Key: key,
        Range: rangeHeader || undefined,
      }),
    );
    if (!res.Body) return null;

    const status = rangeHeader && res.ContentRange ? 206 : 200;
    return {
      key,
      body: res.Body.transformToWebStream(),
      contentType: mimeForGalEffectsKey(key),
      contentLength:
        typeof res.ContentLength === "number" ? res.ContentLength : undefined,
      contentRange: res.ContentRange,
      acceptRanges: res.AcceptRanges || "bytes",
      status,
    };
  } catch (e) {
    const name = (e as { name?: string } | undefined)?.name;
    const status = (e as { $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata?.httpStatusCode;
    if (name === "NoSuchKey" || name === "NotFound" || status === 404) return null;
    throw e;
  }
}

export type LoadGalEffectsResult =
  | { ok: true; data: GalEffectsCatalog }
  | { ok: false; error: "NO_PACK" | "BAD_PACK" };

/**
 * Load `{prefix}/Premiere Pro.json` (or AE) from the gal-toolkit-max bucket.
 */
export async function loadGalEffectsCatalog(
  host: GalEffectsHost = "PR",
  opts: { fresh?: boolean } = {},
): Promise<LoadGalEffectsResult> {
  const cacheKey = host;
  if (!opts.fresh) {
    const hit = catalogCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return { ok: true, data: hit.data };
  }

  const raw = await getR2ObjectText(galToolkitBucket(), galEffectsJsonKey(host));
  if (!raw) return { ok: false, error: "NO_PACK" };

  const body = normalizePackBody(raw);
  if (!body) return { ok: false, error: "BAD_PACK" };

  const etag = `"${createHash("sha256").update(raw).digest("hex").slice(0, 32)}"`;
  const main =
    body.settings.main && typeof body.settings.main === "object"
      ? (body.settings.main as Record<string, unknown>)
      : {};
  const version =
    (typeof main.version === "string" && main.version.trim()) || "1.0.0";
  const packName =
    (typeof main.name === "string" && main.name.trim()) || "Gal Toolkit MAX";

  const data: GalEffectsCatalog = {
    host,
    pack_name: packName,
    version,
    etag,
    settings: body.settings,
    content: body.content,
    assets_base_url: galEffectsMediaBaseUrl(host),
  };

  catalogCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CATALOG_TTL_MS,
  });

  return { ok: true, data };
}

export function parseGalEffectsHost(raw: string | null): GalEffectsHost {
  const v = (raw || "PR").trim().toUpperCase();
  return v === "AE" ? "AE" : "PR";
}

export type GalEffectsAssetsManifest = {
  host: GalEffectsHost;
  etag: string;
  /** Parsed JSON from `{hostPrefix}/manifest.json` (array or `{ files: … }`). */
  manifest: unknown;
};

type CachedManifest = { data: GalEffectsAssetsManifest; expiresAt: number };
const manifestCache = new Map<string, CachedManifest>();
const MANIFEST_TTL_MS = 60_000;

export type LoadGalEffectsManifestResult =
  | { ok: true; data: GalEffectsAssetsManifest }
  | { ok: false; error: "NO_MANIFEST" | "BAD_MANIFEST" };

/**
 * Load `{premiere-pro|after-effects}/manifest.json` from the Gal Toolkit bucket.
 */
export async function loadGalEffectsAssetsManifest(
  host: GalEffectsHost = "PR",
  opts: { fresh?: boolean } = {},
): Promise<LoadGalEffectsManifestResult> {
  const cacheKey = host;
  if (!opts.fresh) {
    const hit = manifestCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return { ok: true, data: hit.data };
  }

  const raw = await getR2ObjectText(galToolkitBucket(), galEffectsManifestKey(host));
  if (!raw) return { ok: false, error: "NO_MANIFEST" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "BAD_MANIFEST" };
  }
  if (parsed == null || (typeof parsed !== "object" && !Array.isArray(parsed))) {
    return { ok: false, error: "BAD_MANIFEST" };
  }

  const etag = `"${createHash("sha256").update(raw).digest("hex").slice(0, 32)}"`;
  const data: GalEffectsAssetsManifest = {
    host,
    etag,
    manifest: parsed,
  };

  manifestCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + MANIFEST_TTL_MS,
  });

  return { ok: true, data };
}

/**
 * Normalize a client `path` query into a relative path under `{hostPrefix}/`.
 * Accepts `Assets/…`, `_Assets/…`, or bare relative paths; rejects `..` / abs / `\`.
 */
export function normalizeGalEffectsRelPath(raw: string): string | null {
  let decoded = raw.trim();
  if (!decoded) return null;
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // keep raw
  }
  decoded = decoded.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!decoded || decoded.includes("\0")) return null;
  const parts = decoded.split("/").filter((p) => p.length > 0 && p !== ".");
  if (parts.length === 0) return null;
  if (parts.some((p) => p === ".." || p.includes("\\"))) return null;
  return parts.join("/");
}

/**
 * Resolve `path` (relative to host prefix) → full R2 key under `{prefix}/`, or null.
 * Sandboxed to the host prefix only (not just Assets/).
 */
export function resolveGalEffectsFileKey(
  relPath: string,
  host: GalEffectsHost = "PR",
): string | null {
  const rel = normalizeGalEffectsRelPath(relPath);
  if (!rel) return null;
  const prefix = `${galEffectsPrefix(host)}/`;
  const key = `${prefix}${rel}`;
  if (!key.startsWith(prefix)) return null;
  return key;
}

export type GalEffectsFileLink = {
  url: string;
  key: string;
  path: string;
  etag: string;
  size: number | null;
  expires_in: number;
};

export type GalEffectsFileLinkResult =
  | { ok: true; data: GalEffectsFileLink }
  | { ok: false; error: "NOT_FOUND" | "BAD_PATH" | "PRESIGN_FAILED" };

/**
 * HeadObject + short-lived presigned GET for a file under `{hostPrefix}/`.
 */
export async function getGalEffectsFilePresign(
  relPath: string,
  host: GalEffectsHost = "PR",
): Promise<GalEffectsFileLinkResult> {
  const key = resolveGalEffectsFileKey(relPath, host);
  if (!key) return { ok: false, error: "BAD_PATH" };

  const prefix = `${galEffectsPrefix(host)}/`;
  const path = key.slice(prefix.length);
  const bucket = galToolkitBucket();
  const client = getR2Client();

  let etag = "";
  let size: number | null = null;
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    etag = (head.ETag || "").replace(/^W\//, "").trim() || "";
    if (!etag) {
      etag = `"${createHash("sha256").update(key).digest("hex").slice(0, 16)}"`;
    } else if (!etag.startsWith('"')) {
      etag = `"${etag.replace(/"/g, "")}"`;
    }
    size = typeof head.ContentLength === "number" ? head.ContentLength : null;
  } catch (e) {
    const name = (e as { name?: string } | undefined)?.name;
    const status = (e as { $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata?.httpStatusCode;
    if (name === "NoSuchKey" || name === "NotFound" || status === 404) {
      return { ok: false, error: "NOT_FOUND" };
    }
    throw e;
  }

  const filename = path.split("/").pop() || "download";
  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn: GAL_EFFECTS_FILE_PRESIGN_TTL_SECONDS },
    );
    return {
      ok: true,
      data: {
        url,
        key,
        path,
        etag,
        size,
        expires_in: GAL_EFFECTS_FILE_PRESIGN_TTL_SECONDS,
      },
    };
  } catch (e) {
    console.error("[gal-effects-file] getSignedUrl failed", e);
    return { ok: false, error: "PRESIGN_FAILED" };
  }
}
