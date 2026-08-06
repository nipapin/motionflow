import "server-only";

import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import {
  buildGalToolkitDemoManifest,
  type GalToolkitDemoHost,
  type GalToolkitDemoManifest,
  galtoolkitDemoZipKey,
  writeGalToolkitDemoManifest,
} from "@/lib/galtoolkit-demo";
import { getR2Bucket, getR2Client } from "@/lib/r2-storage";

export const PREMIEREGAL_BUCKET =
  process.env.R2_PREMIEREGAL_BUCKET?.trim() || "premieregal";

export type PremieregalSourceObject = {
  key: string;
  size: number;
  lastModified: string | null;
  suggestedHost: GalToolkitDemoHost | null;
  kind: "max" | "update" | "compare" | "other";
};

function classifyKey(key: string): Pick<PremieregalSourceObject, "suggestedHost" | "kind"> {
  const k = key.toLowerCase();
  if (k.includes("premiere") || k.includes("ppro")) {
    if (k.includes("update")) return { suggestedHost: "PR", kind: "update" };
    if (k.startsWith("compare_")) return { suggestedHost: "PR", kind: "compare" };
    if (k.includes("max") || k.includes("toolkit")) return { suggestedHost: "PR", kind: "max" };
    return { suggestedHost: "PR", kind: "other" };
  }
  if (k.includes("after_effects") || k.includes("after-effects") || k.includes("aeft") || k.includes("effects")) {
    if (k.includes("update")) return { suggestedHost: "AE", kind: "update" };
    if (k.startsWith("compare_")) return { suggestedHost: "AE", kind: "compare" };
    if (k.includes("max") || k.includes("toolkit")) return { suggestedHost: "AE", kind: "max" };
    return { suggestedHost: "AE", kind: "other" };
  }
  return { suggestedHost: null, kind: "other" };
}

function copySource(bucket: string, key: string): string {
  return `${bucket}/${key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/")}`;
}

/** List zip sources in the legacy `premieregal` bucket (flat root keys). */
export async function listPremieregalDemoSources(opts?: {
  maxKeys?: number;
}): Promise<PremieregalSourceObject[]> {
  const client = getR2Client();
  const maxKeys = opts?.maxKeys ?? 200;
  const out: PremieregalSourceObject[] = [];
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: PREMIEREGAL_BUCKET,
        ContinuationToken: token,
        MaxKeys: Math.min(1000, maxKeys - out.length),
      }),
    );
    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      if (!key || key.endsWith("/") || !key.toLowerCase().endsWith(".zip")) continue;
      const { suggestedHost, kind } = classifyKey(key);
      // Prefer toolkit/compare packs for Packages import UI; skip huge noise later in UI filter.
      out.push({
        key,
        size: Number(obj.Size ?? 0),
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
        suggestedHost,
        kind,
      });
      if (out.length >= maxKeys) break;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token && out.length < maxKeys);

  out.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));
  return out;
}

export function defaultVersionFromSource(source: PremieregalSourceObject): string {
  if (source.lastModified) {
    const d = new Date(source.lastModified);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}.${m}.${day}`;
    }
  }
  const m = source.key.match(/(\d{10,})/);
  if (m) return m[1];
  return new Date().toISOString().slice(0, 10).replace(/-/g, ".");
}

/**
 * Server-side copy from `premieregal` → public CDN layout, then refresh latest.json.
 * Uses R2 CopyObject (no download through the app).
 */
export async function importGalToolkitDemoFromPremieregal(opts: {
  host: GalToolkitDemoHost;
  sourceKey: string;
  version?: string;
  name?: string;
  description?: string;
}): Promise<{ manifest: GalToolkitDemoManifest; destKey: string; bytes: number }> {
  const client = getR2Client();
  const destBucket = getR2Bucket();
  const sourceKey = opts.sourceKey.replace(/^\/+/, "");
  if (!sourceKey || sourceKey.includes("..")) {
    throw new Error("INVALID_SOURCE_KEY");
  }

  const head = await client.send(
    new HeadObjectCommand({
      Bucket: PREMIEREGAL_BUCKET,
      Key: sourceKey,
    }),
  );
  const bytes = Number(head.ContentLength ?? 0);

  const version = (opts.version || defaultVersionFromSource({
    key: sourceKey,
    size: bytes,
    lastModified: head.LastModified ? head.LastModified.toISOString() : null,
    suggestedHost: opts.host,
    kind: "other",
  })).replace(/^v/i, "");

  const destKey = galtoolkitDemoZipKey(opts.host, version);

  await client.send(
    new CopyObjectCommand({
      Bucket: destBucket,
      Key: destKey,
      CopySource: copySource(PREMIEREGAL_BUCKET, sourceKey),
      ContentType: "application/zip",
      MetadataDirective: "REPLACE",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  const manifest = await writeGalToolkitDemoManifest(
    buildGalToolkitDemoManifest({
      host: opts.host,
      version,
      name: opts.name,
      description: opts.description,
    }),
  );

  return { manifest, destKey, bytes };
}
