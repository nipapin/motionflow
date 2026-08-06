/**
 * One-shot: copy newest compare_* demos from premieregal → motionflow-public demo layout.
 *
 *   node scripts/import-premieregal-demos.mjs
 *   node scripts/import-premieregal-demos.mjs --max   # also import Gal_Toolkit_MAX_* (multi-GB)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function copySource(bucket, key) {
  return `${bucket}/${key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")}`;
}

function versionFromDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

loadDotEnv();
const useMax = process.argv.includes("--max");
const sourceBucket = process.env.R2_PREMIEREGAL_BUCKET?.trim() || "premieregal";
const destBucket = requireEnv("R2_PUBLIC_BUCKET");
const cdn = requireEnv("R2_PUBLIC_CDN").replace(/\/+$/, "");
const client = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint:
    process.env.R2_ENDPOINT?.replace(/\/+$/, "") ||
    `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const listed = [];
let token;
do {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: sourceBucket,
      ContinuationToken: token,
      MaxKeys: 1000,
    }),
  );
  for (const o of res.Contents || []) {
    if (o.Key?.toLowerCase().endsWith(".zip")) listed.push(o);
  }
  token = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (token);

function newestMatching(pred) {
  return listed
    .filter((o) => pred(o.Key || ""))
    .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))[0];
}

const jobs = useMax
  ? [
      {
        host: "PR",
        obj: newestMatching((k) => /Gal_Toolkit_MAX_for_Premiere_Pro\.zip$/i.test(k)),
      },
      {
        host: "AE",
        obj: newestMatching((k) => /Gal_Toolkit_MAX_for_After_Effects\.zip$/i.test(k)),
      },
    ]
  : [
      {
        host: "PR",
        obj: newestMatching((k) => /^compare_PPRO_/i.test(k)),
      },
      {
        host: "AE",
        obj: newestMatching((k) => /^compare_AEFT_/i.test(k)),
      },
    ];

for (const job of jobs) {
  if (!job.obj?.Key) {
    console.error("No source for", job.host);
    continue;
  }
  const sourceKey = job.obj.Key;
  const version = versionFromDate(job.obj.LastModified || new Date());
  const destKey = `public/downloads/galtoolkit/demo/${job.host}/${version}/pack.zip`;
  const latestKey = `public/downloads/galtoolkit/demo/${job.host}/latest.json`;
  const downloadUrl = `${cdn}/${destKey
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")}`;

  console.log(`\n${job.host}: ${sourceKey} → ${destKey}`);
  const head = await client.send(
    new HeadObjectCommand({ Bucket: sourceBucket, Key: sourceKey }),
  );
  console.log(" size", head.ContentLength);

  await client.send(
    new CopyObjectCommand({
      Bucket: destBucket,
      Key: destKey,
      CopySource: copySource(sourceBucket, sourceKey),
      ContentType: "application/zip",
      MetadataDirective: "REPLACE",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const manifest = {
    version,
    host: job.host,
    downloadUrl,
    updatedAt: new Date().toISOString(),
    name: useMax ? `Gal Toolkit MAX (${job.host})` : `Gal Toolkit Demo (${job.host})`,
  };
  await client.send(
    new PutObjectCommand({
      Bucket: destBucket,
      Key: latestKey,
      Body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );
  console.log(" published", latestKey, "→", downloadUrl);
}

console.log("\nDone.");
