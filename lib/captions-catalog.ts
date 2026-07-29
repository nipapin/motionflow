import "server-only";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/** Public preview filenames served without auth. */
export const CAPTION_PREVIEW_FILES = new Set([
  "thumb.png",
  "preview.mp4",
]);

/** Downloadable files — only via authenticated POST /api/captions. */
export const CAPTION_DOWNLOAD_FILES = {
  mogrt: "project.mogrt",
  aep: "project.aep",
  definition: "definition.json",
} as const;

/** @deprecated alias — use CAPTION_DOWNLOAD_FILES */
export const CAPTION_PROJECT_FILES = CAPTION_DOWNLOAD_FILES;

export type CaptionProjectFileKind = keyof typeof CAPTION_DOWNLOAD_FILES;

export type CaptionTreeCaption = {
  /** Stable id: `Category/Caption Folder` (use in POST download). */
  id: string;
  name: string;
  slug: string;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
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

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/** Local FS root. Override with `CAPTIONS_ROOT` (future: R2 prefix mirror). */
export function getCaptionsRoot(): string {
  const fromEnv = process.env.CAPTIONS_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve("C:\\Users\\nipap\\Desktop\\Captions");
}

/**
 * Resolve a path relative to captions root. Rejects traversal.
 * `relative` uses `/` separators (URL / id form).
 */
export function resolveCaptionsPath(relative: string): string | null {
  const root = getCaptionsRoot();
  const normalized = relative
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p.length > 0 && p !== "." && p !== "..")
    .join(path.sep);

  if (!normalized) return null;

  const candidate = path.resolve(root, normalized);
  const rel = path.relative(root, candidate);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return candidate;
}

function mediaUrl(category: string, caption: string, file: string): string {
  const parts = [category, caption, file].map(encodeURIComponent).join("/");
  return `/api/captions/media/${parts}`;
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function fileExists(dir: string, name: string): boolean {
  try {
    return statSync(path.join(dir, name)).isFile();
  } catch {
    return false;
  }
}

/** Scan `CAPTIONS_ROOT` → Category → Caption → files. */
export function buildCaptionsTree(): CaptionTree {
  const root = getCaptionsRoot();
  if (!existsSync(root)) {
    return { categories: [] };
  }

  const categories: CaptionTreeCategory[] = [];

  for (const categoryName of listDirs(root)) {
    const categoryDir = path.join(root, categoryName);
    const captions: CaptionTreeCaption[] = [];

    for (const captionName of listDirs(categoryDir)) {
      const captionDir = path.join(categoryDir, captionName);
      const hasThumb = fileExists(captionDir, "thumb.png");
      const hasPreview = fileExists(captionDir, "preview.mp4");
      const hasMogrt = fileExists(captionDir, CAPTION_DOWNLOAD_FILES.mogrt);
      const hasAep = fileExists(captionDir, CAPTION_DOWNLOAD_FILES.aep);
      const hasDefinition = fileExists(
        captionDir,
        CAPTION_DOWNLOAD_FILES.definition,
      );

      // Skip empty / incomplete folders with no recognizable assets
      if (!hasThumb && !hasPreview && !hasMogrt && !hasAep && !hasDefinition) {
        continue;
      }

      captions.push({
        id: `${categoryName}/${captionName}`,
        name: captionName,
        slug: slugify(captionName),
        previewImageUrl: hasThumb
          ? mediaUrl(categoryName, captionName, "thumb.png")
          : null,
        previewVideoUrl: hasPreview
          ? mediaUrl(categoryName, captionName, "preview.mp4")
          : null,
        files: {
          mogrt: hasMogrt,
          aep: hasAep,
          definition: hasDefinition,
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

  return { categories };
}

export function getCaptionDirById(id: string): string | null {
  const dir = resolveCaptionsPath(id);
  if (!dir || !existsSync(dir)) return null;
  try {
    if (!statSync(dir).isDirectory()) return null;
  } catch {
    return null;
  }
  return dir;
}

export function resolveProjectFile(
  id: string,
  kind: CaptionProjectFileKind,
): { absolutePath: string; filename: string } | null {
  const dir = getCaptionDirById(id);
  if (!dir) return null;
  const fileName = CAPTION_DOWNLOAD_FILES[kind];
  const absolutePath = path.join(dir, fileName);
  if (!fileExists(dir, fileName)) return null;
  const captionFolder = path.basename(dir);
  const ext = path.extname(fileName);
  return {
    absolutePath,
    filename:
      kind === "definition"
        ? "definition.json"
        : `${captionFolder}${ext}`,
  };
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
  return MIME[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

/** Only allow known public preview filenames under a caption folder. */
export function resolvePreviewMedia(relativePath: string): string | null {
  const absolute = resolveCaptionsPath(relativePath);
  if (!absolute || !existsSync(absolute)) return null;

  const base = path.basename(absolute);
  if (!CAPTION_PREVIEW_FILES.has(base)) return null;

  try {
    if (!statSync(absolute).isFile()) return null;
  } catch {
    return null;
  }

  // Must be exactly Category/Caption/file (two dirs deep)
  const root = getCaptionsRoot();
  const rel = path.relative(root, absolute);
  const parts = rel.split(path.sep);
  if (parts.length !== 3) return null;

  return absolute;
}

export async function readFileBuffer(absolutePath: string): Promise<Buffer> {
  return readFile(absolutePath);
}

export function createFileWebStream(absolutePath: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(absolutePath);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export function parseProjectFileKind(raw: unknown): CaptionProjectFileKind | null {
  if (raw == null || raw === "") return "mogrt";
  if (raw === "mogrt" || raw === "aep" || raw === "definition") return raw;
  return null;
}
