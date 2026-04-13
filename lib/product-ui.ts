import type { Product, ProductFiles } from "@/lib/product-types";

/** Only allow absolute http(s) URLs from DB for media; blocks javascript:, data:, etc. */
function allowedAssetHttpUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s.startsWith("http://") && !s.startsWith("https://")) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const SLUG_TO_SOFTWARE_LABEL: Record<string, string> = {
  "after-effects": "After Effects",
  "premiere-pro": "Premiere Pro",
  "davinci-resolve": "DaVinci Resolve",
  illustrator: "Illustrator",
  "stock-audio": "Stock Music",
  "sound-fx": "Sound FX",
};

export function softwareLabelToSlug(label: string): string {
  const entry = Object.entries(SLUG_TO_SOFTWARE_LABEL).find(([, l]) => l === label);
  return entry ? entry[0] : label.toLowerCase().replace(/\s+/g, "-");
}

export function productSoftwareLabel(product: Product): string {
  const slug = product.index_category_slug?.toLowerCase() ?? "";
  return SLUG_TO_SOFTWARE_LABEL[slug] ?? titleCaseSlug(slug);
}

export function productCategoryLabel(product: Product): string {
  const raw = product.sub_category_slug?.trim() ?? "";
  if (!raw) return "General";
  return raw
    .split(",")
    .map((s) => titleCaseSlug(s.trim().replace(/-/g, " ")))
    .join(", ");
}

function titleCaseSlug(slug: string): string {
  if (!slug) return "";
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export type ProductKind = "template" | "stock-audio" | "sfx";

export function productKind(product: Product): ProductKind {
  const slug = product.index_category_slug?.toLowerCase() ?? "";
  if (slug === "sound-fx") return "sfx";
  if (slug === "stock-audio") return "stock-audio";
  return "template";
}

/** Coerce DB/API `files` (object or JSON string) to `ProductFiles`. */
export function normalizeProductFiles(files: Product["files"] | string | null | undefined): ProductFiles {
  if (files == null) return {};
  let obj: unknown = files;
  if (typeof files === "string") {
    if (files === "") return {};
    try {
      obj = JSON.parse(files);
    } catch {
      return {};
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return {};
  const o = obj as Record<string, unknown>;
  return {
    main: typeof o.main === "string" ? o.main : undefined,
    image: typeof o.image === "string" ? o.image : undefined,
    video: typeof o.video === "string" ? o.video : undefined,
  };
}

function assetCdnBase(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MOTIONFLOW_CDN) {
    return process.env.NEXT_PUBLIC_MOTIONFLOW_CDN.replace(/\/$/, "");
  }
  return "https://cdn.motionflow.pro";
}

/** Videos and stills share this path; only `{file}` differs (`.mp4` vs `.jpg`). */
const DEFAULT_MARKET_MEDIA_TEMPLATE = "{cdn}/public/market/preview/{id}/{file}";

function applyMarketMediaTemplate(product: Product, fileSegment: string, template: string): string {
  const cdn = assetCdnBase();
  return template.replace("{cdn}", cdn).replace("{id}", String(product.id)).replace("{file}", fileSegment);
}

/**
 * Still/cover filename from a `files.*` slug — parallel to `previewFileSegmentFromSlug` but for images:
 * keeps `.jpg` / `.png` / `.webp` / `.gif`; turns `.mp4` / `.webm` / … into the same stem + `.jpg`;
 * bare stems get `.jpg`.
 */
function coverStillFileSegmentFromSlug(slug: string): string {
  if (!slug.trim()) return "";
  if (slug.startsWith("http://") || slug.startsWith("https://")) {
    return allowedAssetHttpUrl(slug) ? slug : "";
  }
  const q = slug.indexOf("?");
  const path = q >= 0 ? slug.slice(0, q) : slug;
  const query = q >= 0 ? slug.slice(q) : "";
  if (/\.(jpe?g|png|webp|gif)$/i.test(path)) return slug;
  const base = path.replace(/\.(mp4|webm|mov|m4v)$/i, "");
  return `${base}.jpg${query}`;
}

/**
 * Still/thumbnail URL — same path as video previews, `{file}` ends in `.jpg`.
 * `NEXT_PUBLIC_MARKET_COVER_URL_TEMPLATE` overrides; else same template as video (`NEXT_PUBLIC_MARKET_PREVIEW_VIDEO_URL_TEMPLATE` or default below).
 */
function marketCoverPath(product: Product, fileSegment: string): string {
  if (!fileSegment) return "";
  if (fileSegment.startsWith("http://") || fileSegment.startsWith("https://")) {
    return allowedAssetHttpUrl(fileSegment) ? fileSegment : "";
  }
  const template =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MARKET_COVER_URL_TEMPLATE) ||
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MARKET_PREVIEW_VIDEO_URL_TEMPLATE) ||
    DEFAULT_MARKET_MEDIA_TEMPLATE;
  return applyMarketMediaTemplate(product, fileSegment, template);
}

/**
 * Build `{file}` segment for `/preview/{id}/{file}` from a `files.*` slug.
 * If the slug already ends with a known extension, it is kept; otherwise defaults to `.mp4`.
 */
function previewFileSegmentFromSlug(slug: string): string {
  if (!slug.trim()) return "";
  if (slug.startsWith("http://") || slug.startsWith("https://")) {
    return allowedAssetHttpUrl(slug) ? slug : "";
  }
  if (/\.(mp4|webm|mov|m4v|jpe?g|png|webp|gif)(\?.*)?$/i.test(slug)) return slug;
  return `${slug}.mp4`;
}

/**
 * `{cdn}/public/market/preview/{product.id}/{file}` (`{file}` typically `.mp4`).
 * Override with `NEXT_PUBLIC_MARKET_PREVIEW_VIDEO_URL_TEMPLATE`: `{cdn}`, `{id}`, `{file}`.
 */
function marketPreviewPath(product: Product, fileSegment: string): string {
  if (!fileSegment) return "";
  if (fileSegment.startsWith("http://") || fileSegment.startsWith("https://")) {
    return allowedAssetHttpUrl(fileSegment) ? fileSegment : "";
  }
  const template =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MARKET_PREVIEW_VIDEO_URL_TEMPLATE) ||
    DEFAULT_MARKET_MEDIA_TEMPLATE;
  return applyMarketMediaTemplate(product, fileSegment, template);
}

/**
 * Still image for cards/modals: `files.image`, then `files.main`, then `files.video`.
 * Same stem rules as preview video, but the asset is always a raster URL (default `.jpg`).
 */
export function productThumbnailUrl(product: Product): string {
  const f = normalizeProductFiles(product.files);
  const slug = f.image || f.main || f.video;
  if (!slug) return "";
  const file = coverStillFileSegmentFromSlug(slug);
  return marketCoverPath(product, file);
}

/**
 * URL for `<video src>` on hover: first usable among `files.video`, `files.main`, `files.image`.
 * Path: `{cdn}/public/market/preview/{id}/{slug-or-slug.ext}` — extension from the slug when present,
 * else `.mp4`. Raster-only filenames (`.jpg` / `.png` / …) are skipped for `<video>`.
 */
export function productCardVideoSrc(product: Product): string | undefined {
  const f = normalizeProductFiles(product.files);
  for (const slug of [f.video, f.main, f.image]) {
    if (!slug) continue;
    if (slug.startsWith("http://") || slug.startsWith("https://")) {
      if (allowedAssetHttpUrl(slug)) return slug;
      continue;
    }
    const file = previewFileSegmentFromSlug(slug);
    if (/\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(file)) continue;
    const url = marketPreviewPath(product, file);
    if (url) return url;
  }
  const demo = product.demo_url;
  if (
    demo &&
    allowedAssetHttpUrl(demo) &&
    /\.(mp4|webm|mov|m4v)(\?|$)/i.test(demo)
  ) {
    return demo;
  }
  return undefined;
}

/**
 * Audio URL for stock-audio / sound-fx products.
 * Tries `files.main` via CDN, then `demo_url`.
 */
export function productAudioUrl(product: Product): string | undefined {
  const f = normalizeProductFiles(product.files);
  for (const slug of [f.main, f.video]) {
    if (!slug) continue;
    if (slug.startsWith("http://") || slug.startsWith("https://")) {
      if (allowedAssetHttpUrl(slug)) return slug;
      continue;
    }
    const file = /\.(mp3|wav|ogg|aac|flac|m4a|webm)(\?.*)?$/i.test(slug)
      ? slug
      : `${slug}.mp3`;
    const url = marketPreviewPath(product, file);
    if (url) return url;
  }
  if (product.demo_url && allowedAssetHttpUrl(product.demo_url)) return product.demo_url;
  return undefined;
}

export function productPreviewVideoUrl(product: Product): string | undefined {
  if (product.youtube_preview) {
    const id = extractYoutubeId(product.youtube_preview);
    if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
  }
  if (product.demo_url && allowedAssetHttpUrl(product.demo_url)) return product.demo_url;
  return undefined;
}

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([a-zA-Z0-9_-]{6,})/);
  return m ? m[1] : null;
}

/** Sort key for “popular” — higher appears first (newer / larger id). */
export function productPopularityScore(product: Product): number {
  return product.id;
}

export function productIsNew(product: Product): boolean {
  const t = Date.parse(product.created_at);
  if (Number.isNaN(t)) return false;
  const days = (Date.now() - t) / (86400 * 1000);
  return days <= 30;
}

export function productIsPremium(product: Product): boolean {
  return product.exclusive === 1;
}

export function productMatchesSearch(product: Product, query: string): boolean {
  const q = query.toLowerCase();
  return (
    product.name.toLowerCase().includes(q) ||
    product.tags.toLowerCase().includes(q) ||
    product.index_category_slug.toLowerCase().includes(q) ||
    product.sub_category_slug.toLowerCase().includes(q)
  );
}

export function productMatchesSidebarCategory(product: Product, activeCategory: string): boolean {
  const label = productSoftwareLabel(product);
  const sub = product.sub_category_slug ?? "";
  return (
    label.includes(activeCategory) ||
    activeCategory.includes(label) ||
    sub.toLowerCase().includes(activeCategory.toLowerCase())
  );
}
