import "server-only";

import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";
import { listPackagesAuthorRows } from "@/lib/packages-authors-db";

const VIDEO_EXTS = new Set([".webm", ".mp4"]);
const AUDIO_EXTS = new Set([".wav", ".mp3", ".ogg", ".m4a", ".flac"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const MEDIA_EXTS = new Set([...VIDEO_EXTS, ...AUDIO_EXTS, ...IMAGE_EXTS]);

const MIME_BY_EXT: Record<string, string> = {
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export type ShowcaseLeafType = "video" | "audio" | "image";

export type SpunkramShowcaseNode = {
  name: string;
  href: string;
  type: "folder" | ShowcaseLeafType;
  children: SpunkramShowcaseNode[];
  counter?: number;
  media?: string;
  /** Still frame shipped next to a clip, shown until the video starts. */
  poster?: string;
};

export type ShowcaseLocation = {
  bucket: string;
  prefix: string;
  /** Public CDN bucket — media can be linked directly instead of proxied. */
  isPublic: boolean;
};

type MutableFolder = {
  name: string;
  href: string;
  type: "folder";
  kind: "mutable-folder";
  children: Map<string, MutableFolder | SpunkramShowcaseNode>;
};

function isMutableFolder(
  node: MutableFolder | SpunkramShowcaseNode,
): node is MutableFolder {
  return (
    node.type === "folder" &&
    "kind" in node &&
    (node as MutableFolder).kind === "mutable-folder"
  );
}

type CachedTree = { tree: SpunkramShowcaseNode[]; expiresAt: number };
const treeCache = new Map<string, CachedTree>();
const TREE_CACHE_TTL_MS = 5 * 60_000;

function extname(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

function basename(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(0, idx) : fileName;
}

export function mimeForShowcaseKey(key: string): string {
  return MIME_BY_EXT[extname(key)] ?? "application/octet-stream";
}

function leafType(ext: string): ShowcaseLeafType {
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "video";
}

function publicBucketOrNull(): string | null {
  try {
    return getR2Bucket();
  } catch {
    return null;
  }
}

/**
 * Public CDN bucket plus the per-author packages buckets. The private pack
 * bucket stays out: the media proxy is unauthenticated.
 */
async function isAllowedBucket(bucket: string): Promise<boolean> {
  const publicBucket = publicBucketOrNull();
  if (publicBucket && bucket === publicBucket) return true;
  try {
    const authors = await listPackagesAuthorRows();
    return authors.some((a) => a.r2_bucket && a.r2_bucket === bucket);
  } catch (err) {
    console.error("[spunkram-showcase] bucket allowlist lookup failed", err);
    return false;
  }
}

/**
 * Resolve a stored `showcase_prefix` (`prefix/` or `s3://bucket/prefix/`) into
 * a bucket + key prefix. Returns `null` for unknown buckets or malformed input.
 */
export async function resolveShowcaseLocation(
  storedPrefix: string | null | undefined,
): Promise<ShowcaseLocation | null> {
  const raw = (storedPrefix ?? "").trim();
  if (raw === "" || /[\\\0]/.test(raw)) return null;

  let bucket: string | null = null;
  let path = raw;
  const s3 = /^s3:\/\/([^/]+)\/(.*)$/i.exec(raw);
  if (s3) {
    bucket = s3[1]!;
    path = s3[2] ?? "";
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return null;
  }

  const segments = path.split("/").filter((s) => s.length > 0);
  if (segments.length === 0 || segments.some((s) => s === "." || s === "..")) {
    return null;
  }
  const prefix = `${segments.join("/")}/`;

  if (!bucket) {
    const publicBucket = publicBucketOrNull();
    if (!publicBucket) return null;
    return { bucket: publicBucket, prefix, isPublic: true };
  }
  if (!(await isAllowedBucket(bucket))) return null;
  return { bucket, prefix, isPublic: bucket === publicBucketOrNull() };
}

function showcaseMediaUrl(
  location: ShowcaseLocation,
  itemId: number,
  relativeKey: string,
): string {
  if (location.isPublic) {
    return r2PublicUrlForKey(`${location.prefix}${relativeKey}`);
  }
  const encoded = relativeKey
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/api/spunkram/item/${itemId}/showcase-media/${encoded}`;
}

/** Resolve URL path segments back to a full object key inside the prefix. */
export function resolveShowcaseObjectKey(
  location: ShowcaseLocation,
  pathSegments: string[],
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

  return `${location.prefix}${parts.join("/")}`;
}

async function listShowcaseMediaKeys(location: ShowcaseLocation): Promise<string[]> {
  const client = getR2Client();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: location.bucket,
        Prefix: location.prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue;
      const rel = key.slice(location.prefix.length);
      if (!rel || rel.includes("..")) continue;
      if (!MEDIA_EXTS.has(extname(rel))) continue;
      keys.push(rel);
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

function mediaRank(ext: string): number {
  if (ext === ".webm") return 4;
  if (ext === ".mp4") return 3;
  if (AUDIO_EXTS.has(ext)) return 2;
  return 1;
}

type PreferredMedia = { key: string; poster?: string };

/** Prefer .webm over .mp4; a same-named image becomes the clip's poster. */
function dedupePreferredMedia(keys: string[]): PreferredMedia[] {
  const best = new Map<string, PreferredMedia>();
  for (const key of keys) {
    const parts = key.split("/");
    const file = parts[parts.length - 1] ?? key;
    const id = `${parts.slice(0, -1).join("/")}/${basename(file)}`;
    const prev = best.get(id);
    if (!prev) {
      best.set(id, { key });
      continue;
    }
    const [winner, loser] =
      mediaRank(extname(file)) > mediaRank(extname(prev.key))
        ? [key, prev.key]
        : [prev.key, key];
    best.set(id, {
      key: winner,
      poster: IMAGE_EXTS.has(extname(loser)) ? loser : prev.poster,
    });
  }
  return Array.from(best.values());
}

function ensureFolder(
  root: Map<string, MutableFolder | SpunkramShowcaseNode>,
  segments: string[],
  hrefBase: string,
): MutableFolder {
  let children = root;
  let href = hrefBase;
  let folder: MutableFolder | null = null;

  for (const name of segments) {
    href = `${href}/${name}`;
    const existing = children.get(name);
    if (existing && isMutableFolder(existing)) {
      folder = existing;
    } else {
      const created: MutableFolder = {
        name,
        href,
        type: "folder",
        kind: "mutable-folder",
        children: new Map(),
      };
      children.set(name, created);
      folder = created;
    }
    children = folder.children;
  }

  if (!folder) throw new Error("ensureFolder called with empty segments");
  return folder;
}

function finalizeFolder(folder: MutableFolder): SpunkramShowcaseNode {
  const children: SpunkramShowcaseNode[] = [];
  const entries = Array.from(folder.children.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  for (const entry of entries) {
    children.push(isMutableFolder(entry) ? finalizeFolder(entry) : entry);
  }

  const node: SpunkramShowcaseNode = {
    name: folder.name,
    href: folder.href,
    type: "folder",
    children,
  };
  const counter = children.reduce(
    (sum, child) => sum + (child.type === "folder" ? (child.counter ?? 0) : 1),
    0,
  );
  if (counter > 0) node.counter = counter;
  return node;
}

function buildTreeFromKeys(
  keys: string[],
  location: ShowcaseLocation,
  itemId: number,
): SpunkramShowcaseNode[] {
  const preferred = dedupePreferredMedia(keys);
  const root = new Map<string, MutableFolder | SpunkramShowcaseNode>();
  const hrefBase = `/showcase/${itemId}`;
  const loose: SpunkramShowcaseNode[] = [];

  for (const { key: rel, poster } of preferred) {
    const parts = rel.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1]!;
    const folderParts = parts.slice(0, -1);
    const ext = extname(fileName);
    const name = basename(fileName);
    const leaf: SpunkramShowcaseNode = {
      name,
      href: `${hrefBase}/${parts.join("/")}`,
      type: leafType(ext),
      children: [],
      media: showcaseMediaUrl(location, itemId, rel),
      ...(poster ? { poster: showcaseMediaUrl(location, itemId, poster) } : {}),
    };
    if (folderParts.length === 0) {
      loose.push(leaf);
      continue;
    }
    const parent = ensureFolder(root, folderParts, hrefBase);
    parent.children.set(name, leaf);
  }

  const folders = Array.from(root.values())
    .filter(isMutableFolder)
    .map(finalizeFolder)
    .filter((n) => (n.counter ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (loose.length === 0) return folders;

  loose.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const previews: SpunkramShowcaseNode = {
    name: "Previews",
    href: `${hrefBase}/previews`,
    type: "folder",
    children: loose,
    counter: loose.length,
  };
  return [previews, ...folders];
}

/** Showcase tree for one marketplace item, cached per bucket + prefix. */
export async function buildItemShowcaseTree(
  itemId: number,
  location: ShowcaseLocation,
  opts: { fresh?: boolean } = {},
): Promise<SpunkramShowcaseNode[]> {
  const cacheKey = `${itemId}\u0000${location.bucket}\u0000${location.prefix}`;
  const cached = treeCache.get(cacheKey);
  if (!opts.fresh && cached && cached.expiresAt > Date.now()) return cached.tree;

  const keys = await listShowcaseMediaKeys(location);
  const tree = buildTreeFromKeys(keys, location, itemId);
  treeCache.set(cacheKey, { tree, expiresAt: Date.now() + TREE_CACHE_TTL_MS });
  return tree;
}

export type ShowcaseCategorySummary = {
  name: string;
  href: string;
  counter: number;
};

/** Sidebar entries only — the full tree is far too large to ship with the page. */
export async function getItemShowcaseCategories(
  itemId: number,
  location: ShowcaseLocation,
): Promise<ShowcaseCategorySummary[]> {
  const tree = await buildItemShowcaseTree(itemId, location);
  return tree.map((node) => ({
    name: node.name,
    href: node.href,
    counter: node.counter ?? node.children.length,
  }));
}

/** One top-level category with its previews, loaded on demand. */
export async function getItemShowcaseCategory(
  itemId: number,
  location: ShowcaseLocation,
  href: string,
): Promise<SpunkramShowcaseNode | null> {
  const tree = await buildItemShowcaseTree(itemId, location);
  return tree.find((node) => node.href === href) ?? null;
}

export type ShowcaseMediaObject = {
  key: string;
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | undefined;
  contentRange: string | undefined;
  acceptRanges: string;
  status: number;
};

/** Stream one showcase object (supports HTTP Range). */
export async function getShowcaseObjectStream(
  location: ShowcaseLocation,
  key: string,
  rangeHeader: string | null,
): Promise<ShowcaseMediaObject | null> {
  if (!key.startsWith(location.prefix)) return null;
  if (!MEDIA_EXTS.has(extname(key))) return null;

  const client = getR2Client();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: location.bucket,
        Key: key,
        Range: rangeHeader || undefined,
      }),
    );
    if (!res.Body) return null;

    return {
      key,
      body: res.Body.transformToWebStream(),
      contentType: mimeForShowcaseKey(key),
      contentLength:
        typeof res.ContentLength === "number" ? res.ContentLength : undefined,
      contentRange: res.ContentRange,
      acceptRanges: res.AcceptRanges || "bytes",
      status: rangeHeader && res.ContentRange ? 206 : 200,
    };
  } catch (e) {
    const name = (e as { name?: string } | undefined)?.name;
    const status = (e as { $metadata?: { httpStatusCode?: number } } | undefined)
      ?.$metadata?.httpStatusCode;
    if (name === "NoSuchKey" || name === "NotFound" || status === 404) return null;
    throw e;
  }
}
