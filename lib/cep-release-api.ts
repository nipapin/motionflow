import "server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getRedis } from "@/lib/redis";
import { getR2Bucket, getR2Client, getR2PrivateBucket, getR2UploadSigningClient } from "@/lib/r2-storage";
import { buildLatestManifest, cepProductBetaKey, cepProductLatestKey, cepProductZxpKey, compareVersionsAsc, type SpunkramLatestManifest } from "@/lib/spunkram-release";
import { publishCepExtensionUpdate } from "@/lib/cep-events";

export const RELEASE_PRODUCTS = ["spunkram", "gal", "odin"] as const;
export const MAX_ZXP_BYTES = 512 * 1024 * 1024;
const TTL = 3600;
const receiptKey = (id: string) => `cep:release:upload:${id}`;
export class ReleaseError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Dedicated release token if configured; the existing admin secret also works. */
export function releaseIdentity(headers: Headers): string {
  const token = headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || headers.get("x-motionflow-admin-secret")?.trim();
  const secrets = [process.env.CEP_RELEASE_TOKEN, process.env.MOTIONFLOW_ADMIN_API_SECRET].filter(Boolean);
  if (!secrets.length) throw new ReleaseError("Release authentication is not configured on the server", 503);
  const digest = (text: string) => createHash("sha256").update(text).digest();
  if (!token || !secrets.some(secret => timingSafeEqual(digest(token), digest(secret!.trim())))) {
    throw new ReleaseError("A valid release token is required", 401);
  }
  return digest(token).toString("hex");
}

export type ReleaseInput = {
  product: typeof RELEASE_PRODUCTS[number]; version: string; channel: "stable" | "beta";
  size: number; sha256: string; changelog: string;
};
type Receipt = ReleaseInput & { id: string; owner: string; stagingBucket: string; stagingKey: string; published?: SpunkramLatestManifest };

export function validateReleaseInput(raw: unknown): ReleaseInput {
  if (!raw || typeof raw !== "object") throw new ReleaseError("JSON object required");
  const b = raw as Record<string, unknown>;
  if (!RELEASE_PRODUCTS.includes(b.product as ReleaseInput["product"])) throw new ReleaseError("Unknown release product");
  if (typeof b.version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.([1-9]\d*))?$/.test(b.version) || b.version.length > 80) throw new ReleaseError("Expected x.y.z or x.y.z-beta.N version");
  const channel = b.version.includes("-beta.") ? "beta" : "stable";
  if (b.channel !== channel) throw new ReleaseError("Channel must match the version");
  if (!Number.isSafeInteger(b.size) || Number(b.size) < 1 || Number(b.size) > MAX_ZXP_BYTES) throw new ReleaseError("ZXP size must be between 1 byte and 512 MiB");
  if (typeof b.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(b.sha256)) throw new ReleaseError("SHA-256 is required");
  if (b.changelog !== undefined && (typeof b.changelog !== "string" || b.changelog.length > 24000)) throw new ReleaseError("Changelog is too long");
  return { product: b.product as ReleaseInput["product"], version: b.version, channel, size: Number(b.size), sha256: b.sha256, changelog: (b.changelog as string) || "" };
}

export async function releaseCapabilities() {
  getR2Client(); getR2Bucket(); getR2PrivateBucket();
  // Validate CDN configuration as well, before a client changes its version/Git state.
  buildLatestManifest({ product: "spunkram", version: "0.0.0" });
  await getRedis().ping();
  return { protocol: 1, products: RELEASE_PRODUCTS, maxBytes: MAX_ZXP_BYTES };
}

export async function prepareRelease(input: ReleaseInput, owner: string) {
  const id = randomUUID();
  const stagingBucket = getR2PrivateBucket();
  const stagingKey = `cep-release-uploads/${id}.zxp`;
  const uploadUrl = await getSignedUrl(getR2UploadSigningClient(), new PutObjectCommand({
    Bucket: stagingBucket, Key: stagingKey, ContentType: "application/octet-stream", ContentLength: input.size,
  }), { expiresIn: TTL, signableHeaders: new Set(["content-type"]) });
  const receipt: Receipt = { ...input, id, owner, stagingBucket, stagingKey };
  await getRedis().set(receiptKey(id), JSON.stringify(receipt), "EX", TTL);
  return { uploadId: id, uploadUrl, headers: { "Content-Type": "application/octet-stream" }, expiresIn: TTL };
}

function missing(error: unknown): boolean {
  return (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;
}

export async function finalizeRelease(id: string, owner: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new ReleaseError("Invalid upload ID");
  const redis = getRedis();
  const stored = await redis.get(receiptKey(id));
  if (!stored) throw new ReleaseError("Upload expired or was not prepared", 410);
  const receipt = JSON.parse(stored) as Receipt;
  if (receipt.owner !== owner) throw new ReleaseError("Upload belongs to another release credential", 403);
  if (receipt.published) return { manifest: receipt.published, alreadyPublished: true, notified: null };
  const lockKey = `cep:release:lock:${receipt.product}:${receipt.channel}`;
  const lockId = randomUUID();
  if (!await redis.set(lockKey, lockId, "EX", 240, "NX")) throw new ReleaseError("Another release is publishing this channel; retry shortly", 409);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  const client = getR2Client();
  const requestOptions = { abortSignal: controller.signal };
  try {
    // A waiting duplicate may have read the receipt before the previous publisher completed.
    const latestReceipt = JSON.parse((await redis.get(receiptKey(id))) || "null") as Receipt | null;
    if (latestReceipt?.published) return { manifest: latestReceipt.published, alreadyPublished: true, notified: null };
    const bucket = getR2Bucket();
    const pointerKey = receipt.channel === "beta" ? cepProductBetaKey(receipt.product) : cepProductLatestKey(receipt.product);
    let current: SpunkramLatestManifest | null = null;
    try {
      const pointer = await client.send(new GetObjectCommand({ Bucket: bucket, Key: pointerKey }), requestOptions);
      current = JSON.parse(await pointer.Body!.transformToString()) as SpunkramLatestManifest;
    } catch (error) { if (!missing(error)) throw error; }
    if (current && compareVersionsAsc(receipt.version, current.version) < 0) throw new ReleaseError("A newer version is already published; refusing to downgrade", 409);

    const uploaded = await client.send(new GetObjectCommand({ Bucket: receipt.stagingBucket, Key: receipt.stagingKey }), requestOptions);
    if (!uploaded.Body || uploaded.ContentLength !== receipt.size) throw new ReleaseError("Uploaded ZXP size does not match", 422);
    const hash = createHash("sha256");
    let bytes = 0;
    // Stream on the server too: do not buffer a potentially large ZXP into Next.js memory.
    for await (const chunk of uploaded.Body as AsyncIterable<Uint8Array>) {
      bytes += chunk.byteLength;
      if (bytes > receipt.size) throw new ReleaseError("Uploaded ZXP is too large", 422);
      hash.update(chunk);
    }
    if (bytes !== receipt.size || hash.digest("hex") !== receipt.sha256) throw new ReleaseError("Uploaded ZXP SHA-256 does not match", 422);
    const zxpKey = cepProductZxpKey(receipt.product, receipt.version);
    let existing = false;
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: zxpKey }), requestOptions);
      existing = true;
      let existingHash = head.Metadata?.sha256;
      if (!existingHash) {
        const old = await client.send(new GetObjectCommand({ Bucket: bucket, Key: zxpKey }), requestOptions);
        const digest = createHash("sha256");
        for await (const chunk of old.Body as AsyncIterable<Uint8Array>) digest.update(chunk);
        existingHash = digest.digest("hex");
      }
      if (existingHash !== receipt.sha256 || head.ContentLength !== receipt.size) throw new ReleaseError("This version already contains a different ZXP; bump the version", 409);
    } catch (error) { if (!missing(error)) throw error; }
    if (!existing) await client.send(new CopyObjectCommand({
      Bucket: bucket, Key: zxpKey,
      CopySource: `${receipt.stagingBucket}/${receipt.stagingKey}`,
      CopySourceIfMatch: uploaded.ETag,
      MetadataDirective: "REPLACE", Metadata: { sha256: receipt.sha256 },
      ContentType: "application/octet-stream", CacheControl: "public, max-age=31536000, immutable",
    }), requestOptions);
    const manifest = current?.version === receipt.version && current.sha256 === receipt.sha256
      ? current : { ...buildLatestManifest(receipt), sha256: receipt.sha256 };
    if (controller.signal.aborted || await redis.get(lockKey) !== lockId) throw new ReleaseError("Publication timed out; retry", 503);
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: pointerKey, Body: Buffer.from(JSON.stringify(manifest, null, 2)),
      ContentType: "application/json; charset=utf-8", CacheControl: "public, max-age=60",
    }), requestOptions);
    receipt.published = manifest;
    await redis.set(receiptKey(id), JSON.stringify(receipt), "EX", TTL);
    const notified = await publishCepExtensionUpdate({
      version: manifest.version, zxp_url: manifest.zxpUrl, changelog: manifest.changelog,
      channel: receipt.channel, published_at: manifest.publishedAt, product: receipt.product,
    });
    // Publication is already durable; staging cleanup must not turn success into a failure.
    await client.send(new DeleteObjectCommand({ Bucket: receipt.stagingBucket, Key: receipt.stagingKey }), requestOptions).catch(() => {});
    return { manifest, alreadyPublished: false, notified };
  } finally {
    clearTimeout(timer);
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lockKey, lockId);
  }
}
