import "server-only";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Product } from "@/lib/product-types";
import { normalizeProductFiles } from "@/lib/product-ui";
import { getR2Client } from "@/lib/r2-storage";

const DEFAULT_PREFIX = "secure/market/items/";
const PRESIGN_TTL_SECONDS = 10 * 60;

/**
 * Object key for paid marketplace zips on R2 (aligned with Laravel `aniom.paths.marketplace.secure`
 * + `getSignedDownloadLink`: `secure/market/items/{itemId}/{main}.zip`).
 */
export function buildMarketplaceSecureObjectKey(
  itemId: number,
  mainFromFiles: string,
  prefixOverride?: string,
): string {
  const raw =
    prefixOverride?.trim() ||
    process.env.MARKETPLACE_SECURE_KEY_PREFIX?.trim() ||
    DEFAULT_PREFIX;
  const prefix = raw.endsWith("/") ? raw : `${raw}/`;
  const stem = mainFromFiles.replace(/\.zip$/i, "").trim();
  if (!stem) return "";
  return `${prefix}${itemId}/${stem}.zip`;
}

/** Attachment filename in Content-Disposition (Laravel: `str_ireplace('aniom','motionflow', main).zip`). */
export function marketplaceDownloadAttachmentName(mainFromFiles: string): string {
  const stem = mainFromFiles.replace(/\.zip$/i, "").trim();
  const renamed = stem.replace(/aniom/gi, "motionflow");
  return `${renamed || stem || "download"}.zip`;
}

/**
 * Presigned GET for the marketplace zip in the **private** R2 bucket (`R2_BUCKET`), or `null` if not configured / no `files.main`.
 */
export async function getPresignedMarketplaceDownloadUrl(
  product: Product,
): Promise<string | null> {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) return null;
  if (process.env.MOTIONFLOW_DOWNLOAD_USE_R2_PRESIGN === "0") return null;

  const files = normalizeProductFiles(product.files);
  const main = files.main?.trim();
  if (!main) return null;

  const key = buildMarketplaceSecureObjectKey(product.id, main);
  if (!key) return null;

  const filename = marketplaceDownloadAttachmentName(main);

  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key.replace(/^\/+/, ""),
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });

  try {
    return await getSignedUrl(client, command, {
      expiresIn: PRESIGN_TTL_SECONDS,
    });
  } catch (e) {
    console.error("[marketplace-r2-presign] getSignedUrl failed", e);
    return null;
  }
}
