#!/usr/bin/env node
/**
 * One-off migration: upload the local captions library (thumb/preview/mogrt/
 * aep/definition files, organised as `{Category}/{Caption}/...`) into the
 * public R2 bucket, under one key-prefix per "brand" — by default
 * `Gal Captions/` and `Spunkram Captions/` — so `lib/captions-catalog.ts`
 * (R2-backed) can serve both product panels. For now both prefixes get the
 * exact same files.
 *
 * Bucket / credentials come from the same env vars as `lib/r2-storage.ts`:
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BUCKET,
 *   R2_ENDPOINT (or R2_ACCOUNT_ID), R2_REGION (optional, default "auto").
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-captions-to-r2.mjs [--dry-run]
 *
 * Flags:
 *   --source=<dir>        Local captions root (default: CAPTIONS_ROOT env,
 *                          else "C:\Users\nipap\Desktop\Captions").
 *   --dest=<a,b,...>       Comma-separated destination key prefixes
 *                          (default: "Gal Captions,Spunkram Captions").
 *   --concurrency=<n>      Parallel uploads (default 4).
 *   --skip-existing        Skip objects that already exist in R2 (HEAD check).
 *   --dry-run              List planned uploads without touching R2.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_SOURCE = "C:\\Users\\nipap\\Desktop\\Captions";
const DEFAULT_DEST_PREFIXES = ["Gal Captions", "Spunkram Captions"];

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".json": "application/json",
  ".mogrt": "application/octet-stream",
  ".aep": "application/octet-stream",
};

const PUBLIC_PREVIEW_FILES = new Set(["thumb.png", "preview.mp4"]);

function parseArgs(argv) {
  const opts = {
    source: process.env.CAPTIONS_ROOT?.trim() || DEFAULT_SOURCE,
    dest: DEFAULT_DEST_PREFIXES,
    concurrency: 4,
    skipExisting: false,
    dryRun: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--skip-existing") opts.skipExisting = true;
    else if (arg.startsWith("--source=")) opts.source = arg.slice("--source=".length);
    else if (arg.startsWith("--dest=")) {
      opts.dest = arg
        .slice("--dest=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--concurrency=")) {
      const n = Number(arg.slice("--concurrency=".length));
      if (Number.isFinite(n) && n > 0) opts.concurrency = Math.floor(n);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node --env-file=.env scripts/migrate-captions-to-r2.mjs " +
          "[--source=<dir>] [--dest=<a,b>] [--concurrency=<n>] [--skip-existing] [--dry-run]",
      );
      process.exit(0);
    } else {
      console.warn(`[migrate-captions] ignoring unknown arg: ${arg}`);
    }
  }
  if (opts.dest.length === 0) opts.dest = DEFAULT_DEST_PREFIXES;
  return opts;
}

function readEnv(name) {
  const v = process.env[name];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing env ${name} (see .env — same vars as lib/r2-storage.ts).`);
  }
  return v.trim();
}

function readEnvOptional(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function getEndpoint() {
  const direct = readEnvOptional("R2_ENDPOINT");
  if (direct) return direct.replace(/\/+$/, "");
  const accountId = readEnv("R2_ACCOUNT_ID");
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function createClient() {
  return new S3Client({
    region: readEnvOptional("R2_REGION") ?? "auto",
    endpoint: getEndpoint(),
    credentials: {
      accessKeyId: readEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: readEnv("R2_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: false,
  });
}

function contentTypeFor(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function cacheControlFor(fileName) {
  return PUBLIC_PREVIEW_FILES.has(fileName) ? "public, max-age=3600" : "private, no-store";
}

async function listDirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Discover `{Category}/{Caption}/{file}` triples under the local source root. */
async function discoverFiles(sourceRoot) {
  const files = [];
  const categories = await listDirs(sourceRoot);
  for (const category of categories) {
    const categoryDir = path.join(sourceRoot, category);
    const captions = await listDirs(categoryDir);
    for (const caption of captions) {
      const captionDir = path.join(categoryDir, caption);
      let entries;
      try {
        entries = await readdir(captionDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const absolutePath = path.join(captionDir, entry.name);
        const { size } = await stat(absolutePath);
        files.push({ category, caption, file: entry.name, absolutePath, size });
      }
    }
  }
  return files;
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

/** Tiny concurrency-limited task runner (no extra deps). */
async function runWithConcurrency(tasks, limit, worker) {
  let cursor = 0;
  let ok = 0;
  let skipped = 0;
  const failures = [];

  async function runNext() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= tasks.length) return;
      const task = tasks[index];
      try {
        const result = await worker(task);
        if (result === "skipped") skipped += 1;
        else ok += 1;
      } catch (err) {
        failures.push({ task, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return { ok, skipped, failures };
}

async function main() {
  const opts = parseArgs(process.argv);

  console.log(`[migrate-captions] source: ${opts.source}`);
  console.log(`[migrate-captions] dest prefixes: ${opts.dest.join(", ")}`);
  console.log(
    `[migrate-captions] mode: ${opts.dryRun ? "DRY-RUN" : "UPLOAD"} concurrency=${opts.concurrency} skip-existing=${opts.skipExisting}`,
  );

  const files = await discoverFiles(opts.source);
  if (files.length === 0) {
    console.error(`[migrate-captions] No files found under "${opts.source}". Nothing to do.`);
    process.exit(1);
  }
  console.log(
    `[migrate-captions] found ${files.length} file(s) across ` +
      `${new Set(files.map((f) => `${f.category}/${f.caption}`)).size} caption folder(s).`,
  );

  const client = opts.dryRun ? null : createClient();
  const bucket = opts.dryRun ? "(dry-run)" : readEnv("R2_PUBLIC_BUCKET");

  // Build the flat list of individual uploads (file × dest prefix), reading
  // each source file only once and reusing the buffer across destinations.
  const uploads = [];
  for (const f of files) {
    for (const destPrefix of opts.dest) {
      const key = `${destPrefix}/${f.category}/${f.caption}/${f.file}`;
      uploads.push({ ...f, key });
    }
  }

  const bufferCache = new Map();
  async function bufferFor(absolutePath) {
    if (!bufferCache.has(absolutePath)) {
      bufferCache.set(absolutePath, await readFile(absolutePath));
    }
    return bufferCache.get(absolutePath);
  }

  const { ok, skipped, failures } = await runWithConcurrency(
    uploads,
    opts.concurrency,
    async (u) => {
      if (opts.dryRun) {
        console.log(`  [dry-run] would upload → ${u.key} (${u.size} bytes)`);
        return "ok";
      }

      if (opts.skipExisting && (await objectExists(client, bucket, u.key))) {
        console.log(`  • ${u.key}: exists, skipping`);
        return "skipped";
      }

      const body = await bufferFor(u.absolutePath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: u.key,
          Body: body,
          ContentType: contentTypeFor(u.file),
          CacheControl: cacheControlFor(u.file),
        }),
      );
      console.log(`  • ${u.key}: uploaded (${u.size} bytes)`);
      return "ok";
    },
  );

  console.log("");
  console.log(
    `[migrate-captions] done. uploaded=${ok} skipped=${skipped} failed=${failures.length} (of ${uploads.length} planned)`,
  );
  if (failures.length > 0) {
    for (const f of failures) console.error(`  ✗ ${f.task.key}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[migrate-captions] unexpected error:", err);
  process.exit(1);
});
