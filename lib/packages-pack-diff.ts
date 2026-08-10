import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createRequire } from "node:module";
import { PassThrough, Readable, type Readable as NodeReadable } from "node:stream";
import type { PackagesAuthor } from "@/lib/packages-admin";
import type { PackagesProjectDto } from "@/lib/packages-projects";
import { getR2Bucket, getR2Client } from "@/lib/r2-storage";

const nodeRequire = createRequire(import.meta.url);
// CJS package; call signature from @types/archiver is awkward with NodeNext.
const archiver = nodeRequire("archiver") as (
  format: string,
  options?: { zlib?: { level?: number } },
) => import("archiver").Archiver;

/** Basename of download_key without `.zip` → R2 content prefix. */
export function resolvePackContentStem(
  downloadKey: string | null | undefined,
): string | null {
  if (!downloadKey) return null;
  const base = downloadKey.replace(/^\/+/, "").split("/").pop() || "";
  const stem = base.replace(/\.zip$/i, "").trim();
  return stem || null;
}

export type PackManifestEntry = {
  name?: string;
  path: string;
  size?: number;
  hash: string;
};

export type PackManifestMap = Map<string, string>;

/**
 * Normalize array form `[{path,hash}]` or smart_update `{files:{path:{hash}}}`
 * into path → lowercase hash.
 */
export function normalizePackManifest(raw: unknown): PackManifestMap {
  const map: PackManifestMap = new Map();
  if (raw == null) return map;

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const rec = entry as Record<string, unknown>;
      const p =
        typeof rec.path === "string"
          ? rec.path.replace(/\\/g, "/").replace(/^\/+/, "")
          : "";
      const hash = typeof rec.hash === "string" ? rec.hash.trim().toLowerCase() : "";
      if (p && hash && !p.split("/").includes("..")) map.set(p, hash);
    }
    return map;
  }

  if (typeof raw === "object" && raw !== null && "files" in raw) {
    const files = (raw as { files: unknown }).files;
    if (files && typeof files === "object") {
      for (const [key, meta] of Object.entries(files as Record<string, unknown>)) {
        const p = key.replace(/\\/g, "/").replace(/^\/+/, "");
        if (!p || p.split("/").includes("..")) continue;
        let hash = "";
        if (meta && typeof meta === "object" && "hash" in meta) {
          hash = String((meta as { hash: unknown }).hash ?? "")
            .trim()
            .toLowerCase();
        } else if (typeof meta === "string") {
          hash = meta.trim().toLowerCase();
        }
        if (hash) map.set(p, hash);
      }
    }
  }
  return map;
}

export function diffPackManifests(
  local: PackManifestMap,
  remote: PackManifestMap,
): { toDownload: string[]; toDelete: string[] } {
  const toDownload: string[] = [];
  const toDelete: string[] = [];

  for (const [path, remoteHash] of remote) {
    if (path === "manifest.json") continue;
    const localHash = local.get(path);
    if (!localHash || localHash !== remoteHash) toDownload.push(path);
  }

  for (const path of local.keys()) {
    if (path === "manifest.json") continue;
    if (!remote.has(path)) toDelete.push(path);
  }

  toDownload.sort();
  toDelete.sort();
  return { toDownload, toDelete };
}

function resolveAuthorBucket(author: PackagesAuthor | null): string | null {
  const privateBucket = process.env.R2_BUCKET?.trim();
  return (
    author?.r2Bucket?.trim() ||
    privateBucket ||
    (() => {
      try {
        return getR2Bucket();
      } catch {
        return null;
      }
    })()
  );
}

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
    const name = err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
    const code =
      err && typeof err === "object" && "Code" in err
        ? String((err as { Code: unknown }).Code)
        : "";
    if (name === "NoSuchKey" || code === "NoSuchKey" || name === "NotFound") {
      return null;
    }
    throw err;
  }
}

async function getR2ObjectStream(
  bucket: string,
  key: string,
): Promise<NodeReadable | null> {
  const client = getR2Client();
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) return null;
    return res.Body as NodeReadable;
  } catch (err) {
    const name = err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw err;
  }
}

export type PackDiffBuildResult =
  | {
      ok: true;
      zipStream: ReadableStream;
      toDownload: string[];
      toDelete: string[];
      remoteManifestRaw: string;
      stem: string;
    }
  | { ok: false; error: "NO_DOWNLOAD_KEY" | "NO_BUCKET" | "NO_DIFF_SOURCE" };

/**
 * Load remote `{stem}/manifest.json`, diff against client manifest, stream a zip
 * of changed files (always includes updated `manifest.json`).
 */
export async function buildPackDiffZip(opts: {
  project: PackagesProjectDto;
  author: PackagesAuthor | null;
  localManifest: unknown;
}): Promise<PackDiffBuildResult> {
  const stem = resolvePackContentStem(opts.project.downloadKey);
  if (!stem) return { ok: false, error: "NO_DOWNLOAD_KEY" };

  const bucket = resolveAuthorBucket(opts.author);
  if (!bucket) return { ok: false, error: "NO_BUCKET" };

  const manifestKey = `${stem}/manifest.json`;
  const remoteRaw = await getR2ObjectText(bucket, manifestKey);
  if (!remoteRaw) return { ok: false, error: "NO_DIFF_SOURCE" };

  let remoteParsed: unknown;
  try {
    remoteParsed = JSON.parse(remoteRaw);
  } catch {
    return { ok: false, error: "NO_DIFF_SOURCE" };
  }

  const local = normalizePackManifest(opts.localManifest);
  const remote = normalizePackManifest(remoteParsed);
  if (remote.size === 0) return { ok: false, error: "NO_DIFF_SOURCE" };

  const { toDownload, toDelete } = diffPackManifests(local, remote);

  const pass = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.on("error", (err: Error) => {
    pass.destroy(err);
  });
  archive.pipe(pass);

  const webStream = Readable.toWeb(pass) as ReadableStream;

  // Append files asynchronously; callers consume the stream.
  void (async () => {
    try {
      archive.append(remoteRaw, { name: "manifest.json" });

      for (const relPath of toDownload) {
        const key = `${stem}/${relPath}`.replace(/\/+/g, "/");
        const body = await getR2ObjectStream(bucket, key);
        if (!body) {
          console.warn("[pack-diff] missing R2 object", key);
          continue;
        }
        archive.append(body, { name: relPath });
      }

      await archive.finalize();
    } catch (err) {
      console.error("[pack-diff] zip build failed", err);
      try {
        archive.abort();
      } catch {
        /* ignore */
      }
      pass.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return {
    ok: true,
    zipStream: webStream,
    toDownload,
    toDelete,
    remoteManifestRaw: remoteRaw,
    stem,
  };
}
