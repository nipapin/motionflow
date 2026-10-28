// Publish one latest full-install bundle per host. Run after uploading dependencies
// and their manifest. Previous full bundles are replaced, never accumulated.
import nextEnv from "@next/env";
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { TarArchive } from "archiver";

nextEnv.loadEnvConfig(process.cwd());
const bucket = process.env.R2_GAL_TOOLKIT_BUCKET?.trim() || "gal-toolkit-max";
const client = new S3Client({ region: process.env.R2_REGION || "auto",
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
const hostArg = process.argv.find(arg => arg.startsWith("--host="))?.slice(7);
if (hostArg && !["PR", "AE"].includes(hostArg)) throw Error("Use --host=PR or --host=AE, or omit for both");

// Same canonical paths accepted by lib/gal-assets-archive.ts and CEP.
function canonical(raw) {
  const p = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (p.split("/").some(part => !part || part === "." || part === ".." || /[:\0]/.test(part))) return null;
  const lower = p.toLowerCase();
  if (lower.startsWith("fonts/") && /\.(ttf|otf)$/i.test(p)) return `Fonts/${p.slice(6)}`;
  const marker = lower.indexOf("/_assets/");
  if (marker >= 0) return `Assets/_Assets/${p.slice(marker + 9)}`;
  if (lower.startsWith("_assets/")) return `Assets/_Assets/${p.slice(8)}`;
  return null;
}
const readManifest = async prefix => {
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/manifest.json` }));
  return object.Body.transformToString();
};
for (const host of hostArg ? [hostArg] : ["PR", "AE"]) {
  const prefix = host === "PR" ? "premiere-pro" : "after-effects";
  const raw = await readManifest(prefix);
  const manifest = JSON.parse(raw);
  const entries = Array.isArray(manifest) ? manifest : Object.entries(manifest.files || {}).map(([path, meta]) =>
    ({ path, hash: typeof meta === "string" ? meta : meta?.hash }));
  const paths = [...new Set(entries.filter(e => typeof e?.path === "string" && typeof e.hash === "string" && e.hash.trim())
    .map(e => canonical(e.path)).filter(Boolean))].sort();
  if (!paths.length) { console.log(`${host}: no startup dependencies`); continue; }
  const etag = `"${createHash("sha256").update(raw).digest("hex").slice(0, 32)}"`;
  const fingerprint = createHash("sha256").update(JSON.stringify([etag, paths])).digest("hex");
  const key = `${prefix}/Startup/latest.tar.gz`;
  try {
    const existing = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (existing.ContentLength && existing.Metadata?.fingerprint === fingerprint) {
      console.log(`${host}: ready (${existing.ContentLength} bytes)`);
      continue;
    }
  } catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }

  // Migrate the bundle produced during initial setup without fetching it again.
  const legacyKey = `${prefix}/Startup/v1/${fingerprint}.tar.gz`;
  let legacy;
  try { legacy = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: legacyKey })); }
  catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
  if (legacy?.ContentLength) {
    await client.send(new CopyObjectCommand({ Bucket: bucket, Key: key,
      CopySource: `${bucket}/${legacyKey}`, CopySourceIfMatch: legacy.ETag,
      MetadataDirective: "REPLACE", Metadata: { fingerprint }, ContentType: "application/gzip", CacheControl: "private, no-cache" }));
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: legacyKey }));
    console.log(`${host}: published latest (${legacy.ContentLength} bytes); removed initial versioned bundle`);
    continue;
  }

  const dir = await mkdtemp(join(tmpdir(), "gal-startup-"));
  try {
    let next = 0, done = 0;
    console.log(`${host}: preparing ${paths.length} files`);
    const downloads = await Promise.allSettled(Array.from({ length: Math.min(6, paths.length) }, async () => {
      while (next < paths.length) {
        const i = next++;
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `${prefix}/${paths[i]}` }));
        if (!object.Body) throw Error(`Missing ${paths[i]}`);
        await pipeline(object.Body, createWriteStream(join(dir, String(i)), { flags: "wx" }));
        done++;
        if (done % 25 === 0 || done === paths.length) console.log(`${host}: fetched ${done}/${paths.length}`);
      }
    }));
    const failed = downloads.find(result => result.status === "rejected");
    if (failed) throw failed.reason;
    const file = join(dir, "startup.tar.gz");
    const archive = new TarArchive({ gzip: true, gzipOptions: { level: 9 } });
    const writing = pipeline(archive, createWriteStream(file, { flags: "wx" }));
    void writing.catch(() => {});
    for (let i = 0; i < paths.length; i++) archive.file(join(dir, String(i)), { name: `files/${i}`, date: new Date(0), mode: 0o644 });
    await archive.finalize();
    await writing;
    if (await readManifest(prefix) !== raw) throw Error("Manifest changed; run preparation again");
    const size = (await stat(file)).size;
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(file), ContentLength: size,
      ContentType: "application/gzip", CacheControl: "private, no-cache", Metadata: { fingerprint } }));
    console.log(`${host}: published ${size} bytes to ${key}`);
  } finally {
    // dir is the dedicated folder returned by mkdtemp above.
    await rm(dir, { recursive: true, force: true });
  }
}
