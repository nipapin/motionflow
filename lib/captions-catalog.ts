import "server-only";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import {
  getR2Bucket,
  getR2Client,
  getR2PrivateBucket,
  r2PublicUrlForKey,
} from "@/lib/r2-storage";

/** Bucket for thumb/preview (CDN). */
function publicBucket(): string {
  return getR2Bucket();
}

/** Bucket for mogrt/aep/definition (no anonymous CDN). */
function privateBucket(): string {
  return getR2PrivateBucket();
}

/** Public preview filenames served without auth. */
export const CAPTION_PREVIEW_FILES = new Set([
  "thumb.png",
  "preview.mp4",
  "controls.json",
]);

/** Downloadable files — only via authenticated POST /api/captions. */
export const CAPTION_DOWNLOAD_FILES = {
  mogrt: "master.mogrt",
  aep: "master.aep",
  definition: "definition.json",
} as const;

/** @deprecated alias — use CAPTION_DOWNLOAD_FILES */
export const CAPTION_PROJECT_FILES = CAPTION_DOWNLOAD_FILES;

/** Shared template id for POST /api/captions `{ id: "master", file: "aep"|"mogrt" }`. */
export const MASTER_CAPTION_ID = "master";

/** Flat layout (no category folder) groups presets under this catalog category. */
export const FLAT_CAPTIONS_CATEGORY = "Base";

/** Skip AE project footage folders when listing. */
const SKIP_CAPTION_FOLDERS = new Set(["(Footage)", "Footage"]);

export type CaptionProjectFileKind = keyof typeof CAPTION_DOWNLOAD_FILES;

export type CaptionTreeCaption = {
  /** Stable id: `Category/Caption Folder` (use in POST download). */
  id: string;
  name: string;
  slug: string;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  controlsUrl: string | null;
  files: {
    mogrt: boolean;
    aep: boolean;
    definition: boolean;
  };
};

export type CaptionTreeCategory = {
  name: string;
  slug: string;
  captions: CaptionTreeCaption[];
};

export type CaptionTree = {
  categories: CaptionTreeCategory[];
};

/**
 * Which product's catalog to read.
 * Previews live in the public CDN bucket; mogrt/aep/definition in the private
 * bucket under the same key prefix (see migrate-captions-to-r2.mjs).
 */
export type CaptionsBrand = "gal" | "spunkram";

const CAPTIONS_BRAND_PREFIXES: Record<CaptionsBrand, string> = {
  gal: "Gal Captions",
  spunkram: "Spunkram Captions",
};

export const DEFAULT_CAPTIONS_BRAND: CaptionsBrand = "gal";

/** Parse a `brand` query/body param, defaulting to `"gal"` for backward compat. */
export function parseCaptionsBrand(raw: unknown): CaptionsBrand {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "gal" || v === "spunkram") return v;
  return DEFAULT_CAPTIONS_BRAND;
}

export function captionsBrandPrefix(brand: CaptionsBrand): string {
  return CAPTIONS_BRAND_PREFIXES[brand];
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function extname(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

/** Split a caption `id` (`"Category/Caption Folder"`) into segments, rejecting traversal. */
function splitCaptionId(id: string): { category: string; caption: string } | null {
  const raw = id.replace(/\\/g, "/");
  const parts = raw
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== "." && p !== "..");
  if (parts.length !== 2) return null;
  return { category: parts[0], caption: parts[1] };
}

function objectKey(
  brand: CaptionsBrand,
  category: string,
  caption: string,
  file: string,
): string {
  return [captionsBrandPrefix(brand), category, caption, file].join("/");
}

/** Brand-root key for the shared master template: `{Brand}/master.aep`. */
function masterObjectKey(brand: CaptionsBrand, file: string): string {
  return [captionsBrandPrefix(brand), file].join("/");
}

function previewMediaUrl(
  brand: CaptionsBrand,
  category: string,
  caption: string,
  file: string,
): string {
  // Flat layout stores files under `{Brand}/{Caption}/file` (category is virtual).
  if (category === FLAT_CAPTIONS_CATEGORY) {
    return r2PublicUrlForKey([captionsBrandPrefix(brand), caption, file].join("/"));
  }
  return r2PublicUrlForKey(objectKey(brand, category, caption, file));
}

function isNotFoundError(e: unknown): boolean {
  const name = (e as { name?: string } | undefined)?.name;
  const status = (e as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata
    ?.httpStatusCode;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

type CaptionEntry = { category: string; caption: string; file: string };
type MasterFlags = { mogrt: boolean; aep: boolean };

async function listCaptionObjectsInBucket(
  bucket: string,
  brand: CaptionsBrand,
): Promise<{ entries: CaptionEntry[]; master: MasterFlags }> {
  const client = getR2Client();
  const prefix = `${captionsBrandPrefix(brand)}/`;

  const entries: CaptionEntry[] = [];
  const master: MasterFlags = { mogrt: false, aep: false };
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      if (!key) continue;
      const rel = key.slice(prefix.length);
      const parts = rel.split("/").filter(Boolean);
      if (parts.length === 1) {
        // Brand-root: master.aep / master.mogrt
        if (parts[0] === CAPTION_DOWNLOAD_FILES.mogrt) master.mogrt = true;
        else if (parts[0] === CAPTION_DOWNLOAD_FILES.aep) master.aep = true;
        continue;
      }
      if (parts.length === 2) {
        // Flat: {Caption}/{file}
        const [caption, file] = parts;
        if (!caption || !file || SKIP_CAPTION_FOLDERS.has(caption)) continue;
        entries.push({ category: FLAT_CAPTIONS_CATEGORY, caption, file });
        continue;
      }
      if (parts.length === 3) {
        // Nested: {Category}/{Caption}/{file}
        const [category, caption, file] = parts;
        if (!category || !caption || !file) continue;
        if (SKIP_CAPTION_FOLDERS.has(category) || SKIP_CAPTION_FOLDERS.has(caption)) continue;
        entries.push({ category, caption, file });
      }
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return { entries, master };
}

/**
 * Merge public (previews) + private (protected) listings.
 * During migration, protected files may still exist only on public — include
 * those flags so the catalog stays accurate until public copies are deleted.
 */
async function listCaptionObjects(
  brand: CaptionsBrand,
): Promise<{ entries: CaptionEntry[]; master: MasterFlags }> {
  const pub = publicBucket();
  const priv = privateBucket();

  const [publicList, privateList] = await Promise.all([
    listCaptionObjectsInBucket(pub, brand),
    pub === priv
      ? Promise.resolve({ entries: [] as CaptionEntry[], master: { mogrt: false, aep: false } })
      : listCaptionObjectsInBucket(priv, brand),
  ]);

  const byKey = new Map<string, CaptionEntry>();
  for (const e of publicList.entries) {
    byKey.set(`${e.category}/${e.caption}/${e.file}`, e);
  }
  for (const e of privateList.entries) {
    byKey.set(`${e.category}/${e.caption}/${e.file}`, e);
  }

  return {
    entries: Array.from(byKey.values()),
    master: {
      mogrt: publicList.master.mogrt || privateList.master.mogrt,
      aep: publicList.master.aep || privateList.master.aep,
    },
  };
}

type CaptionFlags = {
  thumb: boolean;
  preview: boolean;
  mogrt: boolean;
  aep: boolean;
  definition: boolean;
  controls: boolean;
};

type CachedTree = { tree: CaptionTree; expiresAt: number };
const treeCache = new Map<CaptionsBrand, CachedTree>();
const TREE_CACHE_TTL_MS = 30_000;

/** Scan the R2 bucket's `{brand}` prefix → Category → Caption → files. */
export async function buildCaptionsTree(
  brand: CaptionsBrand,
  opts: { fresh?: boolean } = {},
): Promise<CaptionTree> {
  if (!opts.fresh) {
    const cached = treeCache.get(brand);
    if (cached && cached.expiresAt > Date.now()) return cached.tree;
  }

  const { entries, master } = await listCaptionObjects(brand);

  const categoryOrder: string[] = [];
  const categoryMap = new Map<string, Map<string, CaptionFlags>>();

  for (const { category, caption, file } of entries) {
    if (!categoryMap.has(category)) {
      categoryMap.set(category, new Map());
      categoryOrder.push(category);
    }
    const captions = categoryMap.get(category)!;
    if (!captions.has(caption)) {
      captions.set(caption, {
        thumb: false,
        preview: false,
        mogrt: false,
        aep: false,
        definition: false,
        controls: false,
      });
    }
    const flags = captions.get(caption)!;
    if (file === "thumb.png") flags.thumb = true;
    else if (file === "preview.mp4") flags.preview = true;
    else if (file === "controls.json") flags.controls = true;
    else if (file === "definition.json" || file === CAPTION_DOWNLOAD_FILES.definition) {
      flags.definition = true;
    }
    // Per-style project.* ignored — shared master sets mogrt/aep below.
  }

  categoryOrder.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const categories: CaptionTreeCategory[] = [];
  for (const categoryName of categoryOrder) {
    const captionsMap = categoryMap.get(categoryName)!;
    const captionNames = Array.from(captionsMap.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );

    const captions: CaptionTreeCaption[] = [];
    for (const captionName of captionNames) {
      const flags = captionsMap.get(captionName)!;

      // Presets are folders with controls.json (and optional thumb/preview).
      if (!flags.controls && !flags.thumb && !flags.preview) continue;

      captions.push({
        id: `${categoryName}/${captionName}`,
        name: captionName,
        slug: slugify(captionName),
        previewImageUrl: flags.thumb
          ? previewMediaUrl(brand, categoryName, captionName, "thumb.png")
          : null,
        previewVideoUrl: flags.preview
          ? previewMediaUrl(brand, categoryName, captionName, "preview.mp4")
          : null,
        controlsUrl: flags.controls
          ? previewMediaUrl(brand, categoryName, captionName, "controls.json")
          : null,
        files: {
          // Shared master template — same for every preset.
          mogrt: master.mogrt,
          aep: master.aep,
          definition: flags.definition,
        },
      });
    }

    if (captions.length > 0) {
      categories.push({
        name: categoryName,
        slug: slugify(categoryName),
        captions,
      });
    }
  }

  const tree: CaptionTree = { categories };
  treeCache.set(brand, { tree, expiresAt: Date.now() + TREE_CACHE_TTL_MS });
  return tree;
}

/**
 * Resolve `{id, kind}` → R2 object key.
 * For mogrt/aep: always the shared brand-root `master.aep` / `master.mogrt`
 * (id may be `"master"` or any catalog caption id).
 * For definition: per-caption `definition.json` if present.
 */
export async function resolveProjectFile(
  brand: CaptionsBrand,
  id: string,
  kind: CaptionProjectFileKind,
): Promise<{ key: string; filename: string; bucket: string } | null> {
  const client = getR2Client();
  const buckets = [privateBucket(), publicBucket()].filter(
    (b, i, arr) => arr.indexOf(b) === i,
  );

  if (kind === "mogrt" || kind === "aep") {
    const fileName = CAPTION_DOWNLOAD_FILES[kind];
    const key = masterObjectKey(brand, fileName);
    for (const bucket of buckets) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { key, filename: fileName, bucket };
      } catch (e) {
        if (isNotFoundError(e)) continue;
        throw e;
      }
    }
    return null;
  }

  // definition — per caption folder
  const split = splitCaptionId(id);
  if (!split) return null;

  const fileName = CAPTION_DOWNLOAD_FILES.definition;
  const keys =
    split.category === FLAT_CAPTIONS_CATEGORY
      ? [[captionsBrandPrefix(brand), split.caption, fileName].join("/")]
      : [objectKey(brand, split.category, split.caption, fileName)];

  for (const key of keys) {
    for (const bucket of buckets) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { key, filename: "definition.json", bucket };
      } catch (e) {
        if (isNotFoundError(e)) continue;
        throw e;
      }
    }
  }

  return null;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mogrt": "application/octet-stream",
  ".aep": "application/octet-stream",
  ".json": "application/json",
};

export function mimeForFilename(fileName: string): string {
  return MIME[extname(fileName)] ?? "application/octet-stream";
}

/**
 * Resolve the public CDN URL for a known preview asset (`thumb.png` /
 * `preview.mp4` / `controls.json`) at `Category/Caption/file` or flat
 * `Caption/file`. Returns `null` for anything else.
 */
export function resolvePreviewMediaUrl(
  brand: CaptionsBrand,
  relativePath: string,
): string | null {
  const raw = relativePath.replace(/\\/g, "/");
  const parts = raw.split("/").filter((p) => p.length > 0 && p !== "." && p !== "..");
  if (parts.length === 2) {
    const [caption, file] = parts;
    if (!CAPTION_PREVIEW_FILES.has(file)) return null;
    return previewMediaUrl(brand, FLAT_CAPTIONS_CATEGORY, caption, file);
  }
  if (parts.length !== 3) return null;

  const [category, caption, file] = parts;
  if (!CAPTION_PREVIEW_FILES.has(file)) return null;

  return previewMediaUrl(brand, category, caption, file);
}

export async function readR2ObjectBuffer(
  key: string,
  bucket?: string,
): Promise<Buffer> {
  const client = getR2Client();
  const buckets = bucket
    ? [bucket]
    : [privateBucket(), publicBucket()].filter((b, i, arr) => arr.indexOf(b) === i);

  let lastErr: unknown;
  for (const b of buckets) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: b, Key: key }));
      if (!res.Body) throw new Error(`Empty body for key "${key}"`);
      const bytes = await res.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (e) {
      lastErr = e;
      if (isNotFoundError(e)) continue;
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Missing object "${key}"`);
}

export async function createR2ObjectWebStream(
  key: string,
  bucket?: string,
): Promise<ReadableStream<Uint8Array>> {
  const client = getR2Client();
  const buckets = bucket
    ? [bucket]
    : [privateBucket(), publicBucket()].filter((b, i, arr) => arr.indexOf(b) === i);

  let lastErr: unknown;
  for (const b of buckets) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: b, Key: key }));
      if (!res.Body) throw new Error(`Empty body for key "${key}"`);
      return res.Body.transformToWebStream();
    } catch (e) {
      lastErr = e;
      if (isNotFoundError(e)) continue;
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Missing object "${key}"`);
}

export function parseProjectFileKind(raw: unknown): CaptionProjectFileKind | null {
  if (raw == null || raw === "") return "mogrt";
  if (raw === "mogrt" || raw === "aep" || raw === "definition") return raw;
  return null;
}
