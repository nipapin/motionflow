import "server-only";

import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";

export type GalToolkitDemoHost = "PR" | "AE";

export type GalToolkitDemoManifest = {
  version: string;
  host: GalToolkitDemoHost;
  downloadUrl: string;
  updatedAt: string;
  name?: string;
  description?: string;
};

export type GalToolkitDemoVersionEntry = {
  version: string;
  downloadUrl: string;
  key: string;
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
  name?: string;
  description?: string;
}): GalToolkitDemoManifest {
  const version = opts.version.replace(/^v/i, "");
  const zipKey = galtoolkitDemoZipKey(opts.host, version);
  return {
    version,
    host: opts.host,
    downloadUrl: opts.downloadUrl ?? r2PublicUrlForKey(zipKey),
    updatedAt: opts.updatedAt ?? new Date().toISOString(),
    ...(opts.name != null ? { name: opts.name } : {}),
    ...(opts.description != null ? { description: opts.description } : {}),
  };
}

function readEnvDemoManifest(host: GalToolkitDemoHost): GalToolkitDemoManifest | null {
  const version = process.env[`GALTOOLKIT_DEMO_${host}_VERSION`]?.trim();
  const downloadUrl = process.env[`GALTOOLKIT_DEMO_${host}_URL`]?.trim();
  if (!version || !downloadUrl) return null;
  const name = process.env[`GALTOOLKIT_DEMO_${host}_NAME`]?.trim();
  const description = process.env[`GALTOOLKIT_DEMO_${host}_DESCRIPTION`]?.trim();
  return buildGalToolkitDemoManifest({
    host,
    version,
    downloadUrl,
    name: name || undefined,
    description: description || undefined,
  });
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
      ...(parsed.name != null ? { name: String(parsed.name) } : {}),
      ...(parsed.description != null ? { description: String(parsed.description) } : {}),
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

export async function writeGalToolkitDemoManifest(
  manifest: GalToolkitDemoManifest,
): Promise<GalToolkitDemoManifest> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const next: GalToolkitDemoManifest = {
    ...manifest,
    version: manifest.version.replace(/^v/i, ""),
    updatedAt: new Date().toISOString(),
  };
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: galtoolkitDemoLatestKey(next.host),
      Body: Buffer.from(JSON.stringify(next, null, 2), "utf8"),
      ContentType: "application/json; charset=utf-8",
      CacheControl: "public, max-age=60",
    }),
  );
  return next;
}

/** Upload zip + refresh latest.json on public R2. */
export async function publishGalToolkitDemo(opts: {
  host: GalToolkitDemoHost;
  version: string;
  zipBody: Buffer | Uint8Array;
  updatedAt?: string;
  name?: string;
  description?: string;
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

  const existing = await getGalToolkitDemoManifest(opts.host).catch(() => null);
  const manifest = buildGalToolkitDemoManifest({
    host: opts.host,
    version,
    updatedAt: opts.updatedAt,
    name: opts.name ?? existing?.name,
    description: opts.description ?? existing?.description,
  });

  return writeGalToolkitDemoManifest(manifest);
}

/** Point latest.json at an already-uploaded version (optional name/description patch). */
export async function publishGalToolkitDemoPointer(opts: {
  host: GalToolkitDemoHost;
  version: string;
  name?: string;
  description?: string;
}): Promise<GalToolkitDemoManifest> {
  const existing = await getGalToolkitDemoManifest(opts.host).catch(() => null);
  const manifest = buildGalToolkitDemoManifest({
    host: opts.host,
    version: opts.version,
    name: opts.name ?? existing?.name,
    description: opts.description ?? existing?.description,
  });
  return writeGalToolkitDemoManifest(manifest);
}

export async function listGalToolkitDemoVersionsFromR2(
  host: GalToolkitDemoHost,
): Promise<GalToolkitDemoVersionEntry[]> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const prefix = `public/downloads/galtoolkit/demo/${host}/`;
  const byVersion = new Map<string, GalToolkitDemoVersionEntry>();
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
      const m = key.match(
        new RegExp(`^public/downloads/galtoolkit/demo/${host}/([^/]+)/pack\\.zip$`, "i"),
      );
      if (!m) continue;
      const version = m[1];
      if (!version || version === "latest") continue;
      byVersion.set(version, {
        version,
        key,
        downloadUrl: r2PublicUrlForKey(key),
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return [...byVersion.values()].sort((a, b) => b.version.localeCompare(a.version));
}

export function listDemoHosts(): GalToolkitDemoHost[] {
  return [...HOSTS];
}
