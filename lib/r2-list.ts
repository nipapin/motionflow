import "server-only";

import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";
import type { PackagesAuthor } from "@/lib/packages-admin";
import { isKeyAllowedForAuthor } from "@/lib/packages-admin";

export type R2ListedObject = {
  key: string;
  size: number;
  lastModified: string | null;
  publicUrl: string;
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
      out.push({
        key,
        size: Number(obj.Size ?? 0),
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
        publicUrl: r2PublicUrlForKey(key),
      });
      if (out.length >= maxKeys) return out;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

export async function listR2ObjectsForAuthor(
  author: PackagesAuthor,
  prefixOverride?: string | null,
): Promise<R2ListedObject[]> {
  let prefixes = author.r2Prefixes;

  if (prefixOverride && prefixOverride.trim()) {
    const p = prefixOverride.replace(/^\/+/, "");
    const probeKey = p.endsWith("/") ? `${p}x` : `${p}/x`;
    if (!isKeyAllowedForAuthor(author, probeKey) && !author.r2Prefixes.some((a) => p.startsWith(a))) {
      throw new Error("PREFIX_NOT_ALLOWED");
    }
    prefixes = [p];
  }

  const merged: R2ListedObject[] = [];
  for (const prefix of prefixes) {
    const chunk = await listR2ObjectsUnderPrefix(prefix, {
      bucket: author.r2Bucket,
    });
    for (const item of chunk) {
      if (!merged.some((m) => m.key === item.key)) merged.push(item);
    }
  }
  merged.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));
  return merged;
}
