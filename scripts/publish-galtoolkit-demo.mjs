/**
 * Publish Gal Toolkit demo pack to public R2 and refresh latest.json.
 *
 * Usage:
 *   node scripts/publish-galtoolkit-demo.mjs --host PR --version 2026.08.06 --file ./demo-pr.zip
 *   node scripts/publish-galtoolkit-demo.mjs --host AE --version 2026.08.06 --file ./demo-ae.zip
 *
 * Requires same R2_* env as next-app (.env).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadDotEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

loadDotEnv();

const hostRaw = (arg("host") || "").toUpperCase();
const host = hostRaw === "PPRO" ? "PR" : hostRaw === "AEFT" ? "AE" : hostRaw;
const version = (arg("version") || "").replace(/^v/i, "");
const file = arg("file");

if (!["PR", "AE"].includes(host) || !version || !file) {
  console.error(
    "Usage: node scripts/publish-galtoolkit-demo.mjs --host PR|AE --version 2026.08.06 --file ./pack.zip",
  );
  process.exit(1);
}

const filePath = resolve(file);
if (!existsSync(filePath)) {
  console.error("File not found:", filePath);
  process.exit(1);
}

const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
const bucket = requireEnv("R2_PUBLIC_BUCKET");
const cdn = requireEnv("R2_PUBLIC_CDN").replace(/\/+$/, "");
const endpoint =
  process.env.R2_ENDPOINT?.replace(/\/+$/, "") ||
  `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;

const zipKey = `public/downloads/galtoolkit/demo/${host}/${version}/pack.zip`;
const latestKey = `public/downloads/galtoolkit/demo/${host}/latest.json`;
const downloadUrl = `${cdn}/${zipKey
  .split("/")
  .map((s) => encodeURIComponent(s))
  .join("/")}`;

const client = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
});

const body = readFileSync(filePath);
await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: zipKey,
    Body: body,
    ContentType: "application/zip",
    CacheControl: "public, max-age=31536000, immutable",
  }),
);

const manifest = {
  version,
  host,
  downloadUrl,
  updatedAt: new Date().toISOString(),
};

await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: latestKey,
    Body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
    ContentType: "application/json; charset=utf-8",
    CacheControl: "public, max-age=60",
  }),
);

console.log("Published Gal Toolkit demo:", manifest);
console.log("API: GET https://motionflow.pro/api/galtoolkit/demo?host=" + host);
