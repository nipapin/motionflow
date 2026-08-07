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

export type R2BucketFolder = {
  name: string;
  prefix: string;
};

export type R2BucketListing = {
  prefix: string;
  folders: R2BucketFolder[];
  files: R2ListedObject[];
};

function publicUrlFor(bucket: string, key: string): string | null {
  try {
    const publicBucket = getR2Bucket();
    if (bucket !== publicBucket) return null;
    return r2PublicUrlForKey(key);
  } catch {
    return null;
  }
}

/**
 * Flat listing (no delimiter). Used by legacy studio/r2sync callers.
 * Prefer {@link listR2BucketLevel} for UI browsers — large pack folders
 * otherwise fill the maxKeys budget and hide sibling roots.
 */
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
        publicUrl: publicUrlFor(bucket, key),
      });
      if (out.length >= maxKeys) return out;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return out;
}

/**
 * One directory level via Delimiter="/", like the Cloudflare R2 dashboard.
 * Avoids drowning in nested files under a single pack folder.
 */
export async function listR2BucketLevel(opts: {
  bucket: string;
  prefix?: string | null;
  maxKeys?: number;
}): Promise<R2BucketListing> {
  const client = getR2Client();
  const bucket = opts.bucket.trim();
  const prefix = (opts.prefix || "").replace(/^\/+/, "");
  const normalizedPrefix =
    prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
  const maxKeys = opts.maxKeys ?? 1000;

  const folders: R2BucketFolder[] = [];
  const files: R2ListedObject[] = [];
  const seenFolders = new Set<string>();
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalizedPrefix,
        Delimiter: "/",
        ContinuationToken: token,
        MaxKeys: Math.min(1000, maxKeys),
      }),
    );

    for (const cp of res.CommonPrefixes ?? []) {
      const folderPrefix = (cp.Prefix || "").replace(/^\/+/, "");
      if (!folderPrefix || seenFolders.has(folderPrefix)) continue;
      seenFolders.add(folderPrefix);
      const name = folderPrefix
        .slice(normalizedPrefix.length)
        .replace(/\/$/, "");
      if (!name) continue;
      folders.push({ name, prefix: folderPrefix });
    }

    for (const obj of res.Contents ?? []) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue;
      // Only direct children (Delimiter already scopes this, but guard).
      const rest = key.slice(normalizedPrefix.length);
      if (!rest || rest.includes("/")) continue;
      files.push({
        key,
        size: Number(obj.Size ?? 0),
        lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
        publicUrl: publicUrlFor(bucket, key),
      });
    }

    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.key.localeCompare(b.key));

  return { prefix: normalizedPrefix, folders, files };
}

/** List one level of the author's configured R2 bucket. */
export async function listR2ObjectsForAuthor(
  author: PackagesAuthor,
  prefixOverride?: string | null,
): Promise<R2ListedObject[]> {
  if (!author.r2Bucket?.trim()) {
    throw new Error("BUCKET_NOT_CONFIGURED");
  }

  const listing = await listR2BucketLevel({
    bucket: author.r2Bucket,
    prefix: prefixOverride,
  });

  // Legacy callers expect a flat object list; include folder placeholders
  // so older UIs still show directory names.
  const folderStubs: R2ListedObject[] = listing.folders.map((f) => ({
    key: `${f.prefix}.keep`,
    size: 0,
    lastModified: null,
    publicUrl: null,
  }));

  return [...folderStubs, ...listing.files];
}

export async function listR2BucketForAuthor(
  author: PackagesAuthor,
  prefixOverride?: string | null,
): Promise<R2BucketListing> {
  if (!author.r2Bucket?.trim()) {
    throw new Error("BUCKET_NOT_CONFIGURED");
  }
  return listR2BucketLevel({
    bucket: author.r2Bucket,
    prefix: prefixOverride,
  });
}

/** Flat list of `.zip` keys in the author's bucket (any depth). */
export async function listR2ZipsForAuthor(
  author: PackagesAuthor,
  opts?: { maxKeys?: number },
): Promise<R2ListedObject[]> {
  if (!author.r2Bucket?.trim()) {
    throw new Error("BUCKET_NOT_CONFIGURED");
  }
  const all = await listR2ObjectsUnderPrefix("", {
    bucket: author.r2Bucket,
    maxKeys: opts?.maxKeys ?? 2000,
  });
  return all
    .filter((o) => o.key.toLowerCase().endsWith(".zip"))
    .sort((a, b) => a.key.localeCompare(b.key));
}
