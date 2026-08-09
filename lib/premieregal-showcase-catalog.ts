import "server-only";

import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { PREMIEREGAL_BUCKET } from "@/lib/premieregal-demo-import";
import { getR2Client } from "@/lib/r2-storage";

/** Key prefix inside the `premieregal` bucket for Gal Toolkit Max preview media. */
export const PREMIEREGAL_SHOWCASE_PREFIX =
  "gal-toolkit-max-pr/Gal Toolkit Max Preview Assets/";

const VIDEO_EXTS = new Set([".webm", ".mp4"]);
const AUDIO_EXTS = new Set([".wav", ".mp3", ".ogg", ".m4a", ".flac"]);
const MEDIA_EXTS = new Set([...VIDEO_EXTS, ...AUDIO_EXTS]);

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
};

export type PremieregalShowcaseNode = {
  name: string;
  href: string;
  type: "folder" | "video" | "audio";
  children: PremieregalShowcaseNode[];
  counter?: number;
  media?: string;
  description?: string;
  aspect?: string;
};

type MutableFolder = {
  name: string;
  href: string;
  type: "folder";
  kind: "mutable-folder";
  children: Map<string, MutableFolder | PremieregalShowcaseNode>;
};

function isMutableFolder(
  node: MutableFolder | PremieregalShowcaseNode,
): node is MutableFolder {
  return (
    node.type === "folder" &&
    "kind" in node &&
    (node as MutableFolder).kind === "mutable-folder"
  );
}

type CachedTree = { tree: PremieregalShowcaseNode[]; expiresAt: number };
let treeCache: CachedTree | null = null;
const TREE_CACHE_TTL_MS = 5 * 60_000;

function extname(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

function basename(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(0, idx) : fileName;
}

/**
 * Public playback URL for a key relative to {@link PREMIEREGAL_SHOWCASE_PREFIX}.
 * Prefer `R2_PREMIEREGAL_CDN` when the premieregal bucket has a public custom domain;
 * otherwise stream through the app proxy (presigned GETs return 403 for this bucket).
 */
export function premieregalShowcaseMediaUrl(relativeKey: string): string {
  const normalized = relativeKey.replace(/^\/+/, "");
  const cdn = process.env.R2_PREMIEREGAL_CDN?.trim().replace(/\/+$/, "");
  if (cdn) {
    const fullKey = `${PREMIEREGAL_SHOWCASE_PREFIX}${normalized}`;
    const encoded = fullKey
      .split("/")
      .map((seg) => encodeURIComponent(seg))
      .join("/");
    return `${cdn}/${encoded}`;
  }
  const encoded = normalized
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `/api/premiere-gal/showcase-media/${encoded}`;
}

/** Resolve a URL path segment list → full R2 object key, or null if unsafe / outside prefix. */
export function resolvePremieregalShowcaseObjectKey(
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

  return `${PREMIEREGAL_SHOWCASE_PREFIX}${parts.join("/")}`;
}

export function mimeForShowcaseKey(key: string): string {
  return MIME_BY_EXT[extname(key)] ?? "application/octet-stream";
}

async function listShowcaseMediaKeys(): Promise<string[]> {
  const client = getR2Client();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: PREMIEREGAL_BUCKET,
        Prefix: PREMIEREGAL_SHOWCASE_PREFIX,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue;
      const rel = key.slice(PREMIEREGAL_SHOWCASE_PREFIX.length);
      if (!rel || rel.includes("..")) continue;
      const ext = extname(rel);
      if (!MEDIA_EXTS.has(ext)) continue;
      keys.push(rel);
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

function mediaRank(ext: string): number {
  if (ext === ".webm") return 3;
  if (ext === ".mp4") return 2;
  if (AUDIO_EXTS.has(ext)) return 1;
  return 0;
}

/** Prefer .webm over .mp4 for the same basename; keep audio as-is. */
function dedupePreferredMedia(keys: string[]): string[] {
  const best = new Map<string, string>();
  for (const key of keys) {
    const parts = key.split("/");
    const file = parts[parts.length - 1] ?? key;
    const stem = basename(file);
    const folder = parts.slice(0, -1).join("/");
    const id = `${folder}/${stem}`;
    const ext = extname(file);
    const prev = best.get(id);
    if (!prev || mediaRank(ext) > mediaRank(extname(prev))) {
      best.set(id, key);
    }
  }
  return Array.from(best.values());
}

function ensureFolder(
  root: Map<string, MutableFolder | PremieregalShowcaseNode>,
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

  if (!folder) {
    throw new Error("ensureFolder called with empty segments");
  }
  return folder;
}

function countLeaves(node: PremieregalShowcaseNode): number {
  if (node.type !== "folder") return 1;
  let n = 0;
  for (const child of node.children) n += countLeaves(child);
  return n;
}

function finalizeFolder(folder: MutableFolder): PremieregalShowcaseNode {
  const children: PremieregalShowcaseNode[] = [];
  const entries = Array.from(folder.children.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  for (const entry of entries) {
    if (isMutableFolder(entry)) {
      children.push(finalizeFolder(entry));
    } else {
      children.push(entry);
    }
  }

  const node: PremieregalShowcaseNode = {
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

function buildTreeFromKeys(keys: string[]): PremieregalShowcaseNode[] {
  const preferred = dedupePreferredMedia(keys);
  const root = new Map<string, MutableFolder | PremieregalShowcaseNode>();
  const hrefBase = "/showcase-assets";

  for (const rel of preferred) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const fileName = parts[parts.length - 1]!;
    const folderParts = parts.slice(0, -1);
    const ext = extname(fileName);
    const name = basename(fileName);
    const type: "video" | "audio" = AUDIO_EXTS.has(ext) ? "audio" : "video";
    const parent = ensureFolder(root, folderParts, hrefBase);
    const href = `${parent.href}/${fileName}`;

    parent.children.set(name, {
      name,
      href,
      type,
      children: [],
      media: premieregalShowcaseMediaUrl(rel),
      description: name,
      ...(type === "video" ? { aspect: "480/270" } : {}),
    });
  }

  return Array.from(root.values())
    .filter(isMutableFolder)
    .map(finalizeFolder)
    .filter((n) => (n.counter ?? 0) > 0 || n.children.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function buildTreeUncached(): Promise<PremieregalShowcaseNode[]> {
  const keys = await listShowcaseMediaKeys();
  return buildTreeFromKeys(keys);
}

/** List Preview Assets in the premieregal bucket → nested showcase tree. */
export async function buildPremieregalShowcaseTree(
  opts: { fresh?: boolean } = {},
): Promise<PremieregalShowcaseNode[]> {
  if (!opts.fresh && treeCache && treeCache.expiresAt > Date.now()) {
    return treeCache.tree;
  }

  const tree = await buildTreeUncached();
  treeCache = { tree, expiresAt: Date.now() + TREE_CACHE_TTL_MS };
  return tree;
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

/** Stream a showcase object from the premieregal bucket (supports HTTP Range). */
export async function getPremieregalShowcaseObjectStream(
  key: string,
  rangeHeader: string | null,
): Promise<ShowcaseMediaObject | null> {
  if (!key.startsWith(PREMIEREGAL_SHOWCASE_PREFIX)) return null;

  const client = getR2Client();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: PREMIEREGAL_BUCKET,
        Key: key,
        Range: rangeHeader || undefined,
      }),
    );
    if (!res.Body) return null;

    const status = rangeHeader && res.ContentRange ? 206 : 200;
    return {
      key,
      body: res.Body.transformToWebStream(),
      contentType: mimeForShowcaseKey(key),
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

/** @internal test helper — leaf count for diagnostics */
export function countShowcaseLeaves(tree: PremieregalShowcaseNode[]): number {
  return tree.reduce((sum, n) => sum + countLeaves(n), 0);
}
