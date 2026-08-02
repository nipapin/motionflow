import "server-only";

import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  getR2Bucket,
  getR2Client,
  r2PublicUrlForKey,
} from "@/lib/r2-storage";

export const SPUNKRAM_FFMPEG_KEYS = {
  win: "public/downloads/ffmpeg/win/ffmpeg.exe",
  mac: "public/downloads/ffmpeg/mac/ffmpeg-mac.zip",
} as const;

export type SpunkramReleaseChannel = "stable" | "beta";

export type SpunkramLatestManifest = {
  version: string;
  zxpUrl: string;
  changelog: string;
  publishedAt: string;
  channel?: SpunkramReleaseChannel;
  ffmpeg: {
    win: string;
    mac: string;
  };
};

export type SpunkramVersionEntry = {
  version: string;
  zxpUrl: string;
  channel: SpunkramReleaseChannel;
};

export function spunkramZxpKey(version: string): string {
  const safe = version.replace(/^v/i, "").replace(/[^0-9A-Za-z._-]+/g, "");
  return `public/downloads/spunkram/${safe}/spunkram.zxp`;
}

export function spunkramLatestKey(): string {
  return "public/downloads/spunkram/latest.json";
}

export function spunkramBetaKey(): string {
  return "public/downloads/spunkram/beta.json";
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
  channel?: SpunkramReleaseChannel;
}): SpunkramLatestManifest {
  const version = opts.version.replace(/^v/i, "");
  const zxpKey = opts.zxpKey ?? spunkramZxpKey(version);
  const channel = opts.channel ?? (/-beta/i.test(version) ? "beta" : "stable");
  return {
    version,
    zxpUrl: r2PublicUrlForKey(zxpKey),
    changelog: opts.changelog ?? "",
    publishedAt: opts.publishedAt ?? new Date().toISOString(),
    channel,
    ffmpeg: defaultFfmpegUrls(),
  };
}

function manifestPointerKey(channel: SpunkramReleaseChannel): string {
  return channel === "beta" ? spunkramBetaKey() : spunkramLatestKey();
}

/** Upload ZXP bytes to versioned key and refresh latest.json or beta.json. */
export async function publishSpunkramZxp(opts: {
  version: string;
  zxpBody: Buffer | Uint8Array;
  changelog?: string;
  publishedAt?: string;
  /** Default: beta if version contains `-beta`, else stable. */
  channel?: SpunkramReleaseChannel;
}): Promise<SpunkramLatestManifest> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const version = opts.version.replace(/^v/i, "");
  const channel: SpunkramReleaseChannel =
    opts.channel ?? (/-beta/i.test(version) ? "beta" : "stable");
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
    channel,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: manifestPointerKey(channel),
      Body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );

  return manifest;
}

async function readManifestKey(key: string): Promise<SpunkramLatestManifest | null> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
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

export async function readLatestManifestFromR2(): Promise<SpunkramLatestManifest | null> {
  return readManifestKey(spunkramLatestKey());
}

export async function readBetaManifestFromR2(): Promise<SpunkramLatestManifest | null> {
  const m = await readManifestKey(spunkramBetaKey());
  if (!m) return null;
  return { ...m, channel: m.channel ?? "beta" };
}

function compareVersionsAsc(a: string, b: string): number {
  const parse = (v: string) => {
    const clean = v.replace(/^v/i, "");
    const dash = clean.indexOf("-");
    const core = (dash >= 0 ? clean.slice(0, dash) : clean)
      .split(".")
      .map((x) => parseInt(x, 10) || 0);
    const pre = dash >= 0 ? clean.slice(dash + 1) : null;
    return { core, pre };
  };
  const A = parse(a);
  const B = parse(b);
  const n = Math.max(A.core.length, B.core.length);
  for (let i = 0; i < n; i++) {
    const d = (A.core[i] || 0) - (B.core[i] || 0);
    if (d !== 0) return d;
  }
  if (A.pre === null && B.pre !== null) return 1;
  if (A.pre !== null && B.pre === null) return -1;
  if (A.pre === null && B.pre === null) return 0;
  const preNum = (p: string) => {
    const m = p.match(/beta\.(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  };
  return preNum(A.pre!) - preNum(B.pre!);
}

/**
 * List every uploaded Spunkram ZXP under `public/downloads/spunkram/{version}/spunkram.zxp`.
 * Newest first. Used by admin Settings version switcher.
 */
export async function listSpunkramVersionsFromR2(): Promise<SpunkramVersionEntry[]> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const prefix = "public/downloads/spunkram/";
  const byVersion = new Map<string, SpunkramVersionEntry>();

  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      const key = obj.Key || "";
      // public/downloads/spunkram/0.4.3-beta.1/spunkram.zxp
      const m = key.match(/^public\/downloads\/spunkram\/([^/]+)\/spunkram\.zxp$/i);
      if (!m) continue;
      const version = m[1];
      if (!version || version === "latest" || version === "beta") continue;
      byVersion.set(version, {
        version,
        zxpUrl: r2PublicUrlForKey(key),
        channel: /-beta/i.test(version) ? "beta" : "stable",
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return [...byVersion.values()].sort((a, b) => compareVersionsAsc(b.version, a.version));
}
