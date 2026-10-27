import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { S3Client, ListObjectsV2Command, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const source = option("source");
const bucket = option("bucket");
const prefix = option("prefix")?.replace(/\/+$/, "");
if (!source || !bucket || !prefix || prefix.split("/").some(p => !p || p === "." || p === "..")) {
  throw new Error("Provide --source=<folder> --bucket=<bucket> --prefix=<key prefix>; add --upload to write.");
}
const client = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const entries = await readdir(source, { withFileTypes: true });
const directories = entries.filter(e => e.isDirectory() && !["(Footage)", "Footage"].includes(e.name))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
const files = [];
for (const entry of directories) {
  const body = await readFile(path.join(source, entry.name, "preview.webm"));
  if (!body.length || !body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    throw new Error(`Invalid or empty WebM: ${entry.name}`);
  }
  files.push({ key: `${prefix}/${entry.name}/preview.webm`, body, sha256: createHash("sha256").update(body).digest("hex") });
}
if (!files.length) throw new Error("No preview.webm files found.");
// Validate the entire upload plan against existing caption folders before the first write.
const existing = new Set();
let token;
do {
  const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix + "/", ContinuationToken: token }));
  for (const object of page.Contents || []) existing.add(object.Key);
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);
for (const { key } of files) {
  const folder = key.slice(0, -"preview.webm".length);
  if (![...existing].some(existingKey => existingKey.startsWith(folder))) throw new Error(`Caption folder missing in R2: ${folder}`);
}
console.log(JSON.stringify({ bucket, prefix, files: files.length, bytes: files.reduce((n, f) => n + f.body.length, 0), upload: args.includes("--upload") }));
for (const file of files) {
  if (!args.includes("--upload")) { console.log(JSON.stringify({ key: file.key, bytes: file.body.length })); continue; }
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: file.key, Body: file.body, ContentType: "video/webm",
    CacheControl: "public, max-age=0, must-revalidate", Metadata: { sha256: file.sha256 } }));
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
  if (head.ContentLength !== file.body.length || head.ContentType !== "video/webm" || head.Metadata?.sha256 !== file.sha256) {
    throw new Error(`R2 verification failed: ${file.key}`);
  }
  console.log(JSON.stringify({ key: file.key, bytes: head.ContentLength, verified: true }));
}
