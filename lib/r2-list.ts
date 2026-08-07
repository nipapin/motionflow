import "server-only";

import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";
import type { PackagesAuthor } from "@/lib/packages-admin";

export type R2ListedObject = {
  key: string;
  size: number;
  lastModified: string | null;
  publicUrl: string | null;
};

export async function listR2ObjectsUnderPrefix(
  prefix: string,
  opts?: { maxKeys?: number; bucket?: string | null },
): Promise<R2ListedObject[]> {
  const client = getR2Client();
  const bucket = opts?.bucket?.trim() || getR2Bucket();
  const maxKeys = opts?.maxKeys ?? 500;
  const out: R2ListedObject[] = [];
  let token: string | undefined;
  const publicBucket = (() => {
    try {
      return getR2Bucket();
    } catch {
      return null;
    }
  })();

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix.replace(/^\/+/, ""),
        ContinuationToken: token,
        MaxKeys: Math.min(1000, maxKeys - out.length),
      }),
    );
    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue;
      let publicUrl: string | null = null;
      if (publicBucket && bucket === publicBucket) {
        try {
          publicUrl = r2PublicUrlForKey(key);
        } catch {
          publicUrl = null;
        }
      }
      out.push({
        key,
        size: Number(obj.Size ?? 0),
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
        publicUrl,
      });
      if (out.length >= maxKeys) return out;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

/** List objects in the author's configured R2 bucket (entire bucket). */
export async function listR2ObjectsForAuthor(
  author: PackagesAuthor,
  prefixOverride?: string | null,
): Promise<R2ListedObject[]> {
  if (!author.r2Bucket?.trim()) {
    throw new Error("BUCKET_NOT_CONFIGURED");
  }

  const prefix = prefixOverride?.trim().replace(/^\/+/, "") || "";
  const objects = await listR2ObjectsUnderPrefix(prefix, {
    bucket: author.r2Bucket,
    maxKeys: 1000,
  });
  objects.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));
  return objects;
}
