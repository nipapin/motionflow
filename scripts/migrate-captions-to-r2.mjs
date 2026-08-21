#!/usr/bin/env node
/**
 * Upload the local captions library into R2:
 *   - thumb.png / preview.mp4 → R2_PUBLIC_BUCKET (CDN)
 *   - project.mogrt / project.aep / definition.json → R2_BUCKET (private;
 *     served only via authenticated POST /api/captions)
 *
 * Key layout (both buckets): `{Brand Prefix}/{Category}/{Caption}/{file}`
 * Default prefixes: `Gal Captions`, `Spunkram Captions`.
 *
 * Env (same as lib/r2-storage.ts):
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_PUBLIC_BUCKET, R2_BUCKET (private),
 *   R2_ENDPOINT (or R2_ACCOUNT_ID), R2_REGION (optional)
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-captions-to-r2.mjs [--dry-run]
 *
 * Flags:
 *   --source=<dir>           Local captions root
 *   --dest=<a,b,...>         Destination key prefixes
 *   --concurrency=<n>        Parallel uploads (default 4)
 *   --skip-existing          Skip objects that already exist (HEAD)
 *   --delete-public-protected  After upload, delete protected files from
 *                              the public bucket (cut over to private-only)
 *   --purge-public-protected   List public prefixes and delete protected
 *                              objects only (no local upload required)
 *   --copy-public-to-private   Copy protected objects public→private, then
 *                              optionally pair with --purge-public-protected
 *   --dry-run
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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

const PUBLIC_PREVIEW_FILES = new Set(["thumb.png", "preview.mp4", "controls.json"]);
const PROTECTED_FILES = new Set([
  "project.mogrt",
  "project.aep",
  "definition.json",
]);

function parseArgs(argv) {
  const opts = {
    source: process.env.CAPTIONS_ROOT?.trim() || DEFAULT_SOURCE,
    dest: DEFAULT_DEST_PREFIXES,
    concurrency: 4,
    skipExisting: false,
    dryRun: false,
    deletePublicProtected: false,
    purgePublicProtected: false,
    copyPublicToPrivate: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--skip-existing") opts.skipExisting = true;
    else if (arg === "--delete-public-protected") opts.deletePublicProtected = true;
    else if (arg === "--purge-public-protected") opts.purgePublicProtected = true;
    else if (arg === "--copy-public-to-private") opts.copyPublicToPrivate = true;
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
          "[--source=<dir>] [--dest=<a,b>] [--concurrency=<n>] " +
          "[--skip-existing] [--delete-public-protected] [--dry-run]",
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

function bucketForFile(fileName, publicBucket, privateBucket) {
  if (PUBLIC_PREVIEW_FILES.has(fileName)) return publicBucket;
  if (PROTECTED_FILES.has(fileName)) return privateBucket;
  // Unknown files → private by default
  return privateBucket;
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

async function listProtectedKeysInPublic(client, bucket, destPrefixes) {
  const keys = [];
  for (const destPrefix of destPrefixes) {
    const prefix = `${destPrefix}/`;
    let continuationToken;
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
        const file = key.split("/").pop();
        if (file && PROTECTED_FILES.has(file)) keys.push(key);
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
  }
  return keys;
}

async function main() {
  const opts = parseArgs(process.argv);

  console.log(`[migrate-captions] source: ${opts.source}`);
  console.log(`[migrate-captions] dest prefixes: ${opts.dest.join(", ")}`);
  console.log(
    `[migrate-captions] mode: ${opts.dryRun ? "DRY-RUN" : "UPLOAD"} concurrency=${opts.concurrency} skip-existing=${opts.skipExisting}`,
  );

  const client =
    opts.dryRun && !opts.purgePublicProtected && !opts.copyPublicToPrivate
      ? null
      : createClient();
  const publicBucket =
    opts.dryRun && !opts.purgePublicProtected && !opts.copyPublicToPrivate
      ? "(public)"
      : readEnv("R2_PUBLIC_BUCKET");
  const privateBucket =
    opts.dryRun && !opts.purgePublicProtected && !opts.copyPublicToPrivate
      ? "(private)"
      : readEnvOptional("R2_BUCKET") || readEnv("R2_PUBLIC_BUCKET");

  if (opts.copyPublicToPrivate || opts.purgePublicProtected) {
    if (publicBucket === privateBucket && !opts.dryRun) {
      console.error(
        "[migrate-captions] Refusing cutover: set R2_BUCKET to a private bucket distinct from R2_PUBLIC_BUCKET.",
      );
      process.exit(1);
    }

    if (opts.copyPublicToPrivate) {
      if (opts.dryRun) {
        console.log(
          `[migrate-captions] [dry-run] would copy protected objects ${publicBucket} → ${privateBucket}`,
        );
      } else {
        const keys = await listProtectedKeysInPublic(client, publicBucket, opts.dest);
        console.log(`[migrate-captions] copying ${keys.length} protected object(s) to private…`);
        const copy = await runWithConcurrency(
          keys.map((key) => ({ key })),
          opts.concurrency,
          async (u) => {
            if (opts.skipExisting && (await objectExists(client, privateBucket, u.key))) {
              console.log(`  • ${u.key}: exists on private, skipping`);
              return "skipped";
            }
            await client.send(
              new CopyObjectCommand({
                Bucket: privateBucket,
                Key: u.key,
                CopySource: `${publicBucket}/${u.key.split("/").map(encodeURIComponent).join("/")}`,
                CacheControl: "private, no-store",
              }),
            );
            console.log(`  • copied → ${privateBucket}/${u.key}`);
            return "ok";
          },
        );
        console.log(
          `[migrate-captions] copy done. ok=${copy.ok} skipped=${copy.skipped} failed=${copy.failures.length}`,
        );
        if (copy.failures.length > 0) {
          for (const f of copy.failures) console.error(`  ✗ ${f.task.key}: ${f.error}`);
          process.exit(1);
        }
      }
    }

    if (opts.purgePublicProtected) {
      if (opts.dryRun) {
        console.log(
          `[migrate-captions] [dry-run] would list+delete protected objects under ${opts.dest.join(", ")} on ${publicBucket}`,
        );
        return;
      }
      const keys = await listProtectedKeysInPublic(client, publicBucket, opts.dest);
      console.log(`[migrate-captions] purging ${keys.length} protected public object(s)…`);
      const del = await runWithConcurrency(
        keys.map((key) => ({ key })),
        opts.concurrency,
        async (u) => {
          await client.send(
            new DeleteObjectCommand({ Bucket: publicBucket, Key: u.key }),
          );
          console.log(`  • deleted public ${u.key}`);
          return "ok";
        },
      );
      console.log(
        `[migrate-captions] purge done. deleted=${del.ok} failed=${del.failures.length}`,
      );
      if (del.failures.length > 0) process.exit(1);
      return;
    }

    if (opts.copyPublicToPrivate) return;
  }

  const files = await discoverFiles(opts.source);
  if (files.length === 0) {
    console.error(`[migrate-captions] No files found under "${opts.source}". Nothing to do.`);
    process.exit(1);
  }
  console.log(
    `[migrate-captions] found ${files.length} file(s) across ` +
      `${new Set(files.map((f) => `${f.category}/${f.caption}`)).size} caption folder(s).`,
  );

  if (!opts.dryRun && privateBucket === publicBucket) {
    console.warn(
      "[migrate-captions] WARN: R2_BUCKET unset or equals R2_PUBLIC_BUCKET — " +
        "protected files will land on the public bucket. Set R2_BUCKET to a private bucket.",
    );
  } else {
    console.log(`[migrate-captions] public bucket: ${publicBucket}`);
    console.log(`[migrate-captions] private bucket: ${privateBucket}`);
  }

  const uploads = [];
  for (const f of files) {
    for (const destPrefix of opts.dest) {
      const key = `${destPrefix}/${f.category}/${f.caption}/${f.file}`;
      const bucket = bucketForFile(f.file, publicBucket, privateBucket);
      uploads.push({ ...f, key, bucket });
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
        console.log(`  [dry-run] would upload → ${u.bucket}/${u.key} (${u.size} bytes)`);
        return "ok";
      }

      if (opts.skipExisting && (await objectExists(client, u.bucket, u.key))) {
        console.log(`  • ${u.bucket}/${u.key}: exists, skipping`);
        return "skipped";
      }

      const body = await bufferFor(u.absolutePath);
      await client.send(
        new PutObjectCommand({
          Bucket: u.bucket,
          Key: u.key,
          Body: body,
          ContentType: contentTypeFor(u.file),
          CacheControl: cacheControlFor(u.file),
        }),
      );
      console.log(`  • ${u.bucket}/${u.key}: uploaded (${u.size} bytes)`);
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

  if (opts.deletePublicProtected && publicBucket !== privateBucket) {
    const toDelete = uploads.filter(
      (u) => PROTECTED_FILES.has(u.file) && u.bucket === privateBucket,
    );
    console.log(
      `[migrate-captions] deleting ${toDelete.length} protected object(s) from public bucket…`,
    );
    const del = await runWithConcurrency(toDelete, opts.concurrency, async (u) => {
      if (opts.dryRun) {
        console.log(`  [dry-run] would delete public → ${u.key}`);
        return "ok";
      }
      if (!(await objectExists(client, publicBucket, u.key))) return "skipped";
      await client.send(
        new DeleteObjectCommand({ Bucket: publicBucket, Key: u.key }),
      );
      console.log(`  • deleted public ${u.key}`);
      return "ok";
    });
    console.log(
      `[migrate-captions] public cleanup: deleted=${del.ok} skipped=${del.skipped} failed=${del.failures.length}`,
    );
    if (del.failures.length > 0) {
      for (const f of del.failures) console.error(`  ✗ ${f.task.key}: ${f.error}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("[migrate-captions] fatal:", err);
  process.exit(1);
});
