#!/usr/bin/env node
/**
 * Upload a Spunkram .zxp to the public R2 bucket and refresh latest.json.
 *
 * Keys:
 *   public/downloads/spunkram/{version}/spunkram.zxp
 *   public/downloads/spunkram/latest.json
 *
 * Usage (from next-app):
 *   node --env-file=.env scripts/upload-spunkram-zxp.mjs --zxp=./spunkram.zxp --version=0.1.0
 *   node --env-file=.env scripts/upload-spunkram-zxp.mjs --zxp=./spunkram.zxp --version=0.1.0 --changelog="$(cat CHANGELOG.md)"
 *   node --env-file=.env scripts/upload-spunkram-zxp.mjs --dry-run --zxp=./x.zxp --version=0.1.0
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function parseArgs(argv) {
  const opts = {
    zxp: "",
    version: "",
    changelog: "",
    dryRun: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--zxp=")) opts.zxp = arg.slice("--zxp=".length);
    else if (arg.startsWith("--version=")) opts.version = arg.slice("--version=".length);
    else if (arg.startsWith("--changelog=")) opts.changelog = arg.slice("--changelog=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node --env-file=.env scripts/upload-spunkram-zxp.mjs " +
          "--zxp=<file.zxp> --version=x.y.z [--changelog=...] [--dry-run]",
      );
      process.exit(0);
    } else {
      console.warn(`[upload-zxp] ignoring unknown arg: ${arg}`);
    }
  }
  return opts;
}

function readEnv(name) {
  const v = process.env[name];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Missing env ${name}`);
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
  return `https://${readEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
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

function publicUrl(key) {
  const base = (readEnvOptional("R2_PUBLIC_CDN") || "https://cdn.motionflow.pro").replace(
    /\/+$/,
    "",
  );
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function normalizeVersion(v) {
  return String(v || "")
    .replace(/^v/i, "")
    .replace(/[^0-9A-Za-z._-]+/g, "");
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.zxp) throw new Error("--zxp=<path> is required");
  if (!opts.version) throw new Error("--version=x.y.z is required");

  const version = normalizeVersion(opts.version);
  if (!version) throw new Error("Invalid --version");

  const zxpPath = path.resolve(opts.zxp);
  await stat(zxpPath);

  const zxpKey = `public/downloads/spunkram/${version}/spunkram.zxp`;
  const latestKey = "public/downloads/spunkram/latest.json";
  const ffmpeg = {
    win: publicUrl("public/downloads/ffmpeg/win/ffmpeg.exe"),
    mac: publicUrl("public/downloads/ffmpeg/mac/ffmpeg-mac.zip"),
  };
  const manifest = {
    version,
    zxpUrl: publicUrl(zxpKey),
    changelog: opts.changelog || "",
    publishedAt: new Date().toISOString(),
    ffmpeg,
  };

  if (opts.dryRun) {
    const { size } = await stat(zxpPath);
    console.log(`[dry-run] ${zxpPath} (${size} bytes) → ${zxpKey}`);
    console.log(`[dry-run] latest.json →`, JSON.stringify(manifest, null, 2));
    return;
  }

  const bucket = readEnv("R2_PUBLIC_BUCKET");
  const client = createClient();
  const body = await readFile(zxpPath);

  console.log(`[upload-zxp] bucket=${bucket}`);
  console.log(`  → ${zxpKey} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: zxpKey,
      Body: body,
      ContentType: "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  console.log(`  ✓ ${manifest.zxpUrl}`);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: latestKey,
      Body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );
  console.log(`  ✓ ${publicUrl(latestKey)}`);
  console.log("[upload-zxp] done");
}

main().catch((err) => {
  console.error("[upload-zxp]", err instanceof Error ? err.message : err);
  process.exit(1);
});
