import "server-only";

import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { publishCepExtensionUpdate } from "@/lib/cep-events";
import {
  getR2Bucket,
  getR2Client,
  r2PublicUrlForKey,
} from "@/lib/r2-storage";

export const SPUNKRAM_FFMPEG_KEYS = {
  win: "public/downloads/ffmpeg/win/ffmpeg.exe",
  mac: "public/downloads/ffmpeg/mac/ffmpeg-mac.zip",
} as const;

/** R2 folder under `public/downloads/` for each CEP brand. */
export type CepReleaseProduct = "spunkram" | "gal";

export type SpunkramReleaseChannel = "stable" | "beta";

export type SpunkramLatestManifest = {
  version: string;
  zxpUrl: string;
  changelog: string;
  publishedAt: string;
  channel?: SpunkramReleaseChannel;
  product?: CepReleaseProduct;
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

export function cepProductFromClient(client?: string | null): CepReleaseProduct {
  const c = String(client || "").trim().toLowerCase();
  if (c === "gal-cep" || c === "gal") return "gal";
  return "spunkram";
}

export function cepProductZxpFile(product: CepReleaseProduct): string {
  return product === "gal" ? "gal.zxp" : "spunkram.zxp";
}

export function cepProductZxpKey(product: CepReleaseProduct, version: string): string {
  const safe = version.replace(/^v/i, "").replace(/[^0-9A-Za-z._-]+/g, "");
  return `public/downloads/${product}/${safe}/${cepProductZxpFile(product)}`;
}

export function cepProductLatestKey(product: CepReleaseProduct): string {
  return `public/downloads/${product}/latest.json`;
}

export function cepProductBetaKey(product: CepReleaseProduct): string {
  return `public/downloads/${product}/beta.json`;
}

export function spunkramZxpKey(version: string): string {
  return cepProductZxpKey("spunkram", version);
}

export function spunkramLatestKey(): string {
  return cepProductLatestKey("spunkram");
}

export function spunkramBetaKey(): string {
  return cepProductBetaKey("spunkram");
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
  product?: CepReleaseProduct;
}): SpunkramLatestManifest {
  const product = opts.product ?? "spunkram";
  const version = opts.version.replace(/^v/i, "");
  const zxpKey = opts.zxpKey ?? cepProductZxpKey(product, version);
  const channel = opts.channel ?? (/-beta/i.test(version) ? "beta" : "stable");
  return {
    version,
    zxpUrl: r2PublicUrlForKey(zxpKey),
    changelog: opts.changelog ?? "",
    publishedAt: opts.publishedAt ?? new Date().toISOString(),
    channel,
    product,
    ffmpeg: defaultFfmpegUrls(),
  };
}

function manifestPointerKey(
  product: CepReleaseProduct,
  channel: SpunkramReleaseChannel,
): string {
  return channel === "beta" ? cepProductBetaKey(product) : cepProductLatestKey(product);
}

/** Upload ZXP bytes to versioned key and refresh latest.json or beta.json. */
export async function publishCepProductZxp(opts: {
  product: CepReleaseProduct;
  version: string;
  zxpBody: Buffer | Uint8Array;
  changelog?: string;
  publishedAt?: string;
  /** Default: beta if version contains `-beta`, else stable. */
  channel?: SpunkramReleaseChannel;
}): Promise<SpunkramLatestManifest> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const product = opts.product;
  const version = opts.version.replace(/^v/i, "");
  const channel: SpunkramReleaseChannel =
    opts.channel ?? (/-beta/i.test(version) ? "beta" : "stable");
  const zxpKey = cepProductZxpKey(product, version);

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
    product,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: manifestPointerKey(product, channel),
      Body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );

  await publishCepExtensionUpdate({
    version: manifest.version,
    zxp_url: manifest.zxpUrl,
    changelog: manifest.changelog,
    channel: manifest.channel ?? channel,
    published_at: manifest.publishedAt,
    product,
  });

  return manifest;
}

export async function publishSpunkramZxp(opts: {
  version: string;
  zxpBody: Buffer | Uint8Array;
  changelog?: string;
  publishedAt?: string;
  channel?: SpunkramReleaseChannel;
}): Promise<SpunkramLatestManifest> {
  return publishCepProductZxp({ ...opts, product: "spunkram" });
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

export async function readLatestManifestFromR2(
  product: CepReleaseProduct = "spunkram",
): Promise<SpunkramLatestManifest | null> {
  return readManifestKey(cepProductLatestKey(product));
}

export async function readBetaManifestFromR2(
  product: CepReleaseProduct = "spunkram",
): Promise<SpunkramLatestManifest | null> {
  const m = await readManifestKey(cepProductBetaKey(product));
  if (!m) return null;
  return { ...m, channel: m.channel ?? "beta", product };
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
 * List uploaded ZXPs under `public/downloads/{product}/{version}/{file}.zxp`.
 * Newest first. Used by admin Settings version switcher.
 */
export async function listCepProductVersionsFromR2(
  product: CepReleaseProduct = "spunkram",
): Promise<SpunkramVersionEntry[]> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const prefix = `public/downloads/${product}/`;
  const file = cepProductZxpFile(product).replace(/\./g, "\\.");
  const re = new RegExp(
    `^public\\/downloads\\/${product}\\/([^/]+)\\/${file}$`,
    "i",
  );
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
      const m = key.match(re);
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

export async function listSpunkramVersionsFromR2(): Promise<SpunkramVersionEntry[]> {
  return listCepProductVersionsFromR2("spunkram");
}
