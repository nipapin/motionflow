#!/usr/bin/env node
/**
 * Upload Spunkram ffmpeg binaries to the public R2 bucket.
 *
 * Keys (public CDN, no auth):
 *   public/downloads/ffmpeg/win/ffmpeg.exe
 *   public/downloads/ffmpeg/mac/ffmpeg-mac.zip
 *
 * Env (same as lib/r2-storage.ts):
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BUCKET,
 *   R2_ENDPOINT or R2_ACCOUNT_ID, R2_PUBLIC_CDN (optional, for log URLs),
 *   R2_REGION (optional)
 *
 * Usage (from next-app):
 *   node --env-file=.env scripts/upload-spunkram-ffmpeg.mjs --win=C:\path\ffmpeg.exe --mac=C:\path\ffmpeg-mac.zip
 *   node --env-file=.env scripts/upload-spunkram-ffmpeg.mjs --dry-run --win=… --mac=…
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function parseArgs(argv) {
  const opts = {
    win: "",
    mac: "",
    dryRun: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--win=")) opts.win = arg.slice("--win=".length);
    else if (arg.startsWith("--mac=")) opts.mac = arg.slice("--mac=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node --env-file=.env scripts/upload-spunkram-ffmpeg.mjs " +
          "--win=<ffmpeg.exe> --mac=<ffmpeg-mac.zip> [--dry-run]",
      );
      process.exit(0);
    } else {
      console.warn(`[upload-ffmpeg] ignoring unknown arg: ${arg}`);
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

async function uploadExact(client, bucket, key, filePath, contentType) {
  const body = await readFile(filePath);
  const { size } = await stat(filePath);
  console.log(`  → ${key} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  console.log(`  ✓ ${publicUrl(key)}`);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.win) throw new Error("--win=<path to ffmpeg.exe> is required");
  if (!opts.mac) throw new Error("--mac=<path to ffmpeg-mac.zip> is required");

  const uploads = [
    {
      file: opts.win,
      key: "public/downloads/ffmpeg/win/ffmpeg.exe",
      contentType: "application/octet-stream",
    },
    {
      file: opts.mac,
      key: "public/downloads/ffmpeg/mac/ffmpeg-mac.zip",
      contentType: "application/zip",
    },
  ];

  for (const u of uploads) {
    try {
      await stat(u.file);
    } catch {
      throw new Error(`File not found: ${u.file}`);
    }
  }

  if (opts.dryRun) {
    for (const u of uploads) {
      const { size } = await stat(u.file);
      console.log(`[dry-run] would upload ${u.file} → ${u.key} (${size} bytes)`);
      console.log(`         ${publicUrl(u.key)}`);
    }
    return;
  }

  const bucket = readEnv("R2_PUBLIC_BUCKET");
  const client = createClient();
  console.log(`[upload-ffmpeg] bucket=${bucket}`);
  for (const u of uploads) {
    await uploadExact(client, bucket, u.key, u.file, u.contentType);
  }
  console.log("[upload-ffmpeg] done");
}

main().catch((err) => {
  console.error("[upload-ffmpeg]", err instanceof Error ? err.message : err);
  process.exit(1);
});
