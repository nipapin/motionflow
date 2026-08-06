import "server-only";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";

export type GalToolkitDemoHost = "PR" | "AE";

export type GalToolkitDemoManifest = {
  version: string;
  host: GalToolkitDemoHost;
  downloadUrl: string;
  updatedAt: string;
};

const HOSTS: GalToolkitDemoHost[] = ["PR", "AE"];

export function normalizeDemoHost(raw: string | null | undefined): GalToolkitDemoHost | null {
  if (!raw) return null;
  const v = raw.trim().toUpperCase();
  if (v === "PR" || v === "PPRO" || v === "PREMIERE") return "PR";
  if (v === "AE" || v === "AEFT" || v === "AFTEREFFECTS" || v === "AFTER_EFFECTS") return "AE";
  return null;
}

export function galtoolkitDemoZipKey(host: GalToolkitDemoHost, version: string): string {
  const safe = version.replace(/^v/i, "").replace(/[^0-9A-Za-z._-]+/g, "");
  return `public/downloads/galtoolkit/demo/${host}/${safe}/pack.zip`;
}

export function galtoolkitDemoLatestKey(host: GalToolkitDemoHost): string {
  return `public/downloads/galtoolkit/demo/${host}/latest.json`;
}

export function buildGalToolkitDemoManifest(opts: {
  host: GalToolkitDemoHost;
  version: string;
  downloadUrl?: string;
  updatedAt?: string;
}): GalToolkitDemoManifest {
  const version = opts.version.replace(/^v/i, "");
  const zipKey = galtoolkitDemoZipKey(opts.host, version);
  return {
    version,
    host: opts.host,
    downloadUrl: opts.downloadUrl ?? r2PublicUrlForKey(zipKey),
    updatedAt: opts.updatedAt ?? new Date().toISOString(),
  };
}

function readEnvDemoManifest(host: GalToolkitDemoHost): GalToolkitDemoManifest | null {
  const version = process.env[`GALTOOLKIT_DEMO_${host}_VERSION`]?.trim();
  const downloadUrl = process.env[`GALTOOLKIT_DEMO_${host}_URL`]?.trim();
  if (!version || !downloadUrl) return null;
  return buildGalToolkitDemoManifest({ host, version, downloadUrl });
}

async function readManifestFromR2(host: GalToolkitDemoHost): Promise<GalToolkitDemoManifest | null> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: galtoolkitDemoLatestKey(host),
      }),
    );
    const text = await res.Body?.transformToString("utf8");
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<GalToolkitDemoManifest>;
    if (!parsed.version || !parsed.downloadUrl) return null;
    return {
      version: String(parsed.version).replace(/^v/i, ""),
      host,
      downloadUrl: String(parsed.downloadUrl),
      updatedAt: parsed.updatedAt ? String(parsed.updatedAt) : new Date().toISOString(),
    };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

/** Prefer env override (fast ship), else public R2 latest.json. */
export async function getGalToolkitDemoManifest(
  host: GalToolkitDemoHost,
): Promise<GalToolkitDemoManifest | null> {
  const fromEnv = readEnvDemoManifest(host);
  if (fromEnv) return fromEnv;
  try {
    return await readManifestFromR2(host);
  } catch (err) {
    console.error("[galtoolkit-demo] R2 read failed", host, err);
    return null;
  }
}

/** Upload zip + refresh latest.json on public R2 (for publish scripts / admin). */
export async function publishGalToolkitDemo(opts: {
  host: GalToolkitDemoHost;
  version: string;
  zipBody: Buffer | Uint8Array;
  updatedAt?: string;
}): Promise<GalToolkitDemoManifest> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const version = opts.version.replace(/^v/i, "");
  const zipKey = galtoolkitDemoZipKey(opts.host, version);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: zipKey,
      Body: opts.zipBody,
      ContentType: "application/zip",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const manifest = buildGalToolkitDemoManifest({
    host: opts.host,
    version,
    updatedAt: opts.updatedAt,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: galtoolkitDemoLatestKey(opts.host),
      Body: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );

  return manifest;
}

export function listDemoHosts(): GalToolkitDemoHost[] {
  return [...HOSTS];
}
