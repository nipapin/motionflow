import "server-only";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  getR2Bucket,
  getR2Client,
  r2PublicUrlForKey,
} from "@/lib/r2-storage";

export const SPUNKRAM_FFMPEG_KEYS = {
  win: "public/downloads/ffmpeg/win/ffmpeg.exe",
  mac: "public/downloads/ffmpeg/mac/ffmpeg-mac.zip",
} as const;

export type SpunkramLatestManifest = {
  version: string;
  zxpUrl: string;
  changelog: string;
  publishedAt: string;
  ffmpeg: {
    win: string;
    mac: string;
  };
};

export function spunkramZxpKey(version: string): string {
  const safe = version.replace(/^v/i, "").replace(/[^0-9A-Za-z._-]+/g, "");
  return `public/downloads/spunkram/${safe}/spunkram.zxp`;
}

export function spunkramLatestKey(): string {
  return "public/downloads/spunkram/latest.json";
}

export function defaultFfmpegUrls(): SpunkramLatestManifest["ffmpeg"] {
  return {
    win: r2PublicUrlForKey(SPUNKRAM_FFMPEG_KEYS.win),
    mac: r2PublicUrlForKey(SPUNKRAM_FFMPEG_KEYS.mac),
  };
}

export function buildLatestManifest(opts: {
  version: string;
  changelog?: string;
  publishedAt?: string;
  zxpKey?: string;
}): SpunkramLatestManifest {
  const version = opts.version.replace(/^v/i, "");
  const zxpKey = opts.zxpKey ?? spunkramZxpKey(version);
  return {
    version,
    zxpUrl: r2PublicUrlForKey(zxpKey),
    changelog: opts.changelog ?? "",
    publishedAt: opts.publishedAt ?? new Date().toISOString(),
    ffmpeg: defaultFfmpegUrls(),
  };
}

/** Upload ZXP bytes to versioned key and refresh latest.json pointer. */
export async function publishSpunkramZxp(opts: {
  version: string;
  zxpBody: Buffer | Uint8Array;
  changelog?: string;
  publishedAt?: string;
}): Promise<SpunkramLatestManifest> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const version = opts.version.replace(/^v/i, "");
  const zxpKey = spunkramZxpKey(version);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: zxpKey,
      Body: opts.zxpBody,
      ContentType: "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const manifest = buildLatestManifest({
    version,
    changelog: opts.changelog,
    publishedAt: opts.publishedAt,
    zxpKey,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: spunkramLatestKey(),
      Body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );

  return manifest;
}

export async function readLatestManifestFromR2(): Promise<SpunkramLatestManifest | null> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: spunkramLatestKey(),
      }),
    );
    const text = await res.Body?.transformToString("utf8");
    if (!text) return null;
    const parsed = JSON.parse(text) as SpunkramLatestManifest;
    if (!parsed?.version || !parsed?.zxpUrl) return null;
    return parsed;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}
