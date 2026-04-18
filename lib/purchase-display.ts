import type { Product } from "@/lib/product-types";

/**
 * Mirrors Laravel `config('aniom.marketplace.licenses')` and
 * `MarketplaceItemController::getLicenseInfo($index_category_slug)` → `categories[*].type`.
 */
const LICENSES_BY_ITEM_TYPE = {
  template: {
    1: "Personal License",
    3: "Commercial License",
    10: "Multi-Reseller License",
  },
  audio: {
    1: "Personal License",
    20: "Mass Reproduction",
    40: "Broadcast & Film",
  },
  script: {
    1: "Personal License",
    2: "Server License",
  },
} as const;

type ItemLicenseType = keyof typeof LICENSES_BY_ITEM_TYPE;

/** `marketplace.categories[*].type` from Laravel `config/aniom.php`. */
const INDEX_CATEGORY_SLUG_TO_LICENSE_TYPE: Record<string, ItemLicenseType> = {
  "after-effects": "template",
  "premiere-pro": "template",
  "davinci-resolve": "template",
  "final-cut-pro-x": "template",
  graphics: "script",
  "stock-audio": "audio",
  "sound-fx": "audio",
  addons: "script",
  /** Used by this app; closest match is template licenses (same as AE/Pr templates). */
  illustrator: "template",
};

function licenseTypeForProduct(product: Product | null): ItemLicenseType {
  const slug = product?.index_category_slug?.toLowerCase() ?? "";
  return INDEX_CATEGORY_SLUG_TO_LICENSE_TYPE[slug] ?? "template";
}

/**
 * Same as Laravel `UserPagesController::purchasesPage`:
 * `isset($key->select_licenses[$key->license]) ? ... : 'Undefined License'`
 */
export function soldLicenseTitle(product: Product | null, license: number): string {
  if (!Number.isFinite(license)) return "Undefined License";
  const type = licenseTypeForProduct(product);
  const map = LICENSES_BY_ITEM_TYPE[type] as Record<number, string>;
  const title = map[license];
  return title ?? "Undefined License";
}
