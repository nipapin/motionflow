import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { TarArchive } from "archiver";
import { normalizePackManifest } from "@/lib/packages-pack-diff";
import {
  galEffectsPrefix,
  galToolkitBucket,
  loadGalEffectsAssetsManifest,
  type GalEffectsHost,
} from "@/lib/gal-toolkit-effects";
import { getR2Client } from "@/lib/r2-storage";

const ARCHIVE_ROOT = join(tmpdir(), "motionflow-gal-archives");
const ARCHIVE_TTL_MS = 60 * 60_000;

/** Match CEP's canonical startup dependency/font paths, including old manifests. */
function canonicalAssetPath(raw: string): string | null {
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (p.split("/").some(part => !part || part === "." || part === ".." || /[:\0]/.test(part))) return null;
  const lower = p.toLowerCase();
  if (lower.startsWith("fonts/") && /\.(ttf|otf)$/i.test(p)) return `Fonts/${p.slice(6)}`;
  const marker = lower.indexOf("/_assets/");
  if (marker >= 0) return `Assets/_Assets/${p.slice(marker + 9)}`;
  if (lower.startsWith("_assets/")) return `Assets/_Assets/${p.slice(8)}`;
  return null;
}

export class GalArchiveError extends Error {
  constructor(message: string, readonly status = 500) { super(message); }
}

function archivePath(userId: string | number, id: string): string {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new GalArchiveError("BAD_ARCHIVE_ID", 400);
  const owner = createHash("sha256").update(String(userId)).digest("hex");
  return join(ARCHIVE_ROOT, `${owner}-${id}.tar.gz`);
}

export async function removeGalAssetsArchive(userId: string | number, id: string): Promise<void> {
  try { await unlink(archivePath(userId, id)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

async function removeExpiredArchives(): Promise<void> {
  const entries = await readdir(ARCHIVE_ROOT, { withFileTypes: true });
  await Promise.all(entries.filter(entry => entry.isFile() && /^[a-f0-9-]+\.tar\.gz$/.test(entry.name)).map(async entry => {
    const file = join(ARCHIVE_ROOT, entry.name);
    try {
      if (Date.now() - (await stat(file)).mtimeMs > ARCHIVE_TTL_MS) await unlink(file);
    } catch { /* Another worker may already have removed it. */ }
  }));
}

/** Materialize first so the download has an exact Content-Length and byte progress. */
export async function createGalAssetsArchive(opts: {
  userId: string | number;
  host: GalEffectsHost;
  paths: unknown;
  manifestEtag: unknown;
  signal: AbortSignal;
  direct?: boolean;
}) {
  if (!Array.isArray(opts.paths) || !opts.paths.length || opts.paths.length > 50_000 ||
      opts.paths.some(p => typeof p !== "string") || new Set(opts.paths).size !== opts.paths.length) {
    throw new GalArchiveError("BAD_PATHS", 400);
  }
  const manifest = await loadGalEffectsAssetsManifest(opts.host, { fresh: true });
  if (!manifest.ok) throw new GalArchiveError(manifest.error, 404);
  if (opts.manifestEtag !== manifest.data.etag) throw new GalArchiveError("MANIFEST_CHANGED", 409);
  const allowed = new Set<string>();
  for (const rel of normalizePackManifest(manifest.data.manifest).keys()) {
    const canonical = canonicalAssetPath(rel);
    if (canonical) allowed.add(canonical);
  }
  const paths = opts.paths as string[];
  if (paths.some(p => canonicalAssetPath(p) !== p || !allowed.has(p))) throw new GalArchiveError("BAD_PATHS", 400);

  // One current full-install bundle is published ahead of time. Only clients
  // supporting direct URLs receive them; older clients keep the temporary API.
  if (opts.direct && paths.length === allowed.size) {
    const ordered = [...allowed].sort();
    const fingerprint = createHash("sha256").update(JSON.stringify([manifest.data.etag, ordered])).digest("hex");
    const key = `${galEffectsPrefix(opts.host)}/Startup/latest.tar.gz`;
    try {
      const object = await getR2Client().send(new HeadObjectCommand({ Bucket: galToolkitBucket(), Key: key }), { abortSignal: opts.signal });
      if (object.ContentLength && object.ETag && object.Metadata?.fingerprint === fingerprint) {
        // Bind the transfer to these bytes even if latest is replaced after HEAD.
        const url = await getSignedUrl(getR2Client(), new GetObjectCommand({ Bucket: galToolkitBucket(), Key: key, IfMatch: object.ETag }), { expiresIn: 3600 });
        return { id: randomUUID(), size: object.ContentLength, format: "tar.gz" as const,
          manifest_etag: manifest.data.etag, url, paths: ordered, shared: true, archive_etag: object.ETag };
      }
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 404) throw error;
      // Publish bundles before releasing a new manifest. Retain compatibility
      // while a newly uploaded manifest is being prepared.
    }
  }

  await mkdir(ARCHIVE_ROOT, { recursive: true });
  await removeExpiredArchives();
  const id = randomUUID();
  const file = archivePath(opts.userId, id);
  const archive = new TarArchive({ gzip: true, gzipOptions: { level: 1 } });
  const output = createWriteStream(file, { flags: "wx", mode: 0o600 });
  const opened = once(output, "open");
  let source: Readable | undefined;
  const writing = pipeline(archive, output, { signal: opts.signal });
  // Observe failures immediately, including while an R2 request is pending.
  void writing.catch(() => {});
  const abort = () => {
    source?.destroy(new Error("ABORTED"));
    archive.abort();
    archive.destroy(new Error("ABORTED"));
  };
  opts.signal.addEventListener("abort", abort, { once: true });
  try {
    await opened;
    for (let i = 0; i < paths.length; i++) {
      if (opts.signal.aborted) throw new GalArchiveError("ABORTED", 499);
      if (archive.destroyed) throw new GalArchiveError("ARCHIVE_FAILED");
      const object = await getR2Client().send(new GetObjectCommand({
        Bucket: galToolkitBucket(), Key: `${galEffectsPrefix(opts.host)}/${paths[i]}`,
      }), { abortSignal: opts.signal });
      if (!object.Body || object.ContentLength == null) throw new GalArchiveError("NOT_FOUND", 404);
      source = object.Body as Readable;
      // Supply size so archiver streams each R2 object instead of buffering it.
      const stats = await stat(file);
      stats.size = object.ContentLength;
      const entryDone = new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          archive.off("entry", complete);
          archive.off("error", fail);
          archive.off("close", closed);
          source?.off("error", fail);
        };
        const complete = () => { cleanup(); resolve(); };
        const fail = (error: Error) => { cleanup(); reject(error); };
        const closed = () => fail(new Error("ARCHIVE_CLOSED"));
        archive.once("entry", complete);
        archive.once("error", fail);
        archive.once("close", closed);
        source!.once("error", fail);
      });
      // Short ASCII member names avoid platform/path and TAR long-name ambiguity.
      archive.append(source, { name: `files/${i}`, stats, mode: 0o644, date: new Date(0) });
      await entryDone;
      source = undefined;
    }
    await archive.finalize();
    await writing;
    const size = (await stat(file)).size;
    // Fallback if CEP closes or crashes before its DELETE acknowledgement.
    setTimeout(() => { void removeGalAssetsArchive(opts.userId, id).catch(() => {}); }, ARCHIVE_TTL_MS).unref();
    return { id, size, format: "tar.gz" as const, manifest_etag: manifest.data.etag };
  } catch (error) {
    source?.destroy();
    archive.abort();
    archive.destroy();
    output.destroy();
    await writing.catch(() => {});
    await removeGalAssetsArchive(opts.userId, id);
    throw error;
  } finally {
    opts.signal.removeEventListener("abort", abort);
  }
}

export async function getGalAssetsArchive(userId: string | number, id: string) {
  const file = archivePath(userId, id);
  try {
    const info = await stat(file);
    if (Date.now() - info.mtimeMs > ARCHIVE_TTL_MS) {
      await removeGalAssetsArchive(userId, id);
      throw new GalArchiveError("ARCHIVE_EXPIRED", 410);
    }
    return { size: info.size, body: Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array> };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new GalArchiveError("ARCHIVE_NOT_FOUND", 404);
    throw error;
  }
}
