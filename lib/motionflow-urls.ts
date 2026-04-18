import type { Product } from "@/lib/product-types";

/** URL segment `package-name` for motionflow.pro item routes (aligned with product modal query slug). */
export function productPackageSlug(product: Product): string {
  return packageSlugFromName(product.name);
}

export function packageSlugFromName(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return s || "item";
}

export function motionflowSiteOrigin(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_MOTIONFLOW_SITE) {
    return process.env.NEXT_PUBLIC_MOTIONFLOW_SITE.replace(/\/$/, "");
  }
  return "https://motionflow.pro";
}

/**
 * `https://motionflow.pro/item/{package-name}/{item-id}/download`
 * When the product row is missing, falls back to `item-{itemId}` as the package segment.
 */
export function motionflowItemDownloadUrl(product: Product | null, itemId: number, titleFallback: string): string {
  const slug = product ? productPackageSlug(product) : packageSlugFromName(titleFallback);
  return `${motionflowSiteOrigin()}/item/${slug}/${itemId}/download`;
}

/** Item landing page on the main site (same path without `/download`). */
export function motionflowItemPageUrl(product: Product | null, itemId: number, titleFallback: string): string {
  const slug = product ? productPackageSlug(product) : packageSlugFromName(titleFallback);
  return `${motionflowSiteOrigin()}/item/${slug}/${itemId}`;
}

/**
 * License / invoice page, e.g.
 * `https://motionflow.pro/item/{package-name}/{item-id}/license?id={sold_items.id}`
 *
 * Override with `NEXT_PUBLIC_MOTIONFLOW_INVOICE_URL` using placeholders `{slug}`, `{itemId}`, `{id}`.
 */
export function motionflowInvoiceUrl(
  product: Product | null,
  itemId: number,
  titleFallback: string,
  soldItemId: number,
): string {
  const slug = product ? productPackageSlug(product) : packageSlugFromName(titleFallback);
  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_MOTIONFLOW_INVOICE_URL?.trim() : undefined;
  if (raw && raw.includes("{")) {
    return raw
      .replace(/\{slug\}/g, slug)
      .replace(/\{itemId\}/g, String(itemId))
      .replace(/\{id\}/g, String(soldItemId));
  }
  const base = motionflowSiteOrigin();
  return `${base}/item/${slug}/${itemId}/license?id=${soldItemId}`;
}
