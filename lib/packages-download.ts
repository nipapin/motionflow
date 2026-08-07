import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PackagesAuthor } from "@/lib/packages-admin";
import type { PackagesProjectDto } from "@/lib/packages-projects";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";

const PRESIGN_TTL_SECONDS = 10 * 60;

/**
 * Resolve a download URL for a CEP packages project zip.
 * Public keys → CDN URL; private / other → presigned GET on author or default private bucket.
 */
export async function getPackagesProjectDownloadUrl(
  project: PackagesProjectDto,
  author: PackagesAuthor | null,
): Promise<string | null> {
  const key = project.downloadKey?.replace(/^\/+/, "");
  if (!key) return null;

  if (key.startsWith("public/")) {
    try {
      return r2PublicUrlForKey(key);
    } catch {
      return null;
    }
  }

  if (project.downloadUrl) return project.downloadUrl;

  const privateBucket = process.env.R2_BUCKET?.trim();
  const bucket =
    author?.r2Bucket?.trim() ||
    privateBucket ||
    (() => {
      try {
        return getR2Bucket();
      } catch {
        return null;
      }
    })();

  if (!bucket) return null;

  const stem = key.split("/").pop()?.replace(/\.zip$/i, "") || `pack-${project.id}`;
  const filename = `${stem.replace(/aniom/gi, "motionflow")}.zip`;
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });

  try {
    return await getSignedUrl(client, command, {
      expiresIn: PRESIGN_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[packages-download] getSignedUrl failed", e);
    return null;
  }
}
