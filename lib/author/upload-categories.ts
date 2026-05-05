/** Slugs align with `marketplace_items.index_category_slug` / `lib/product-ui.ts`. */
export const UPLOAD_CATEGORIES = [
  { slug: "after-effects", label: "After Effects" },
  { slug: "premiere-pro", label: "Premiere Pro" },
  { slug: "davinci-resolve", label: "DaVinci Resolve" },
  { slug: "illustrator", label: "Illustrator" },
  { slug: "stock-audio", label: "Stock Audio" },
  { slug: "sound-fx", label: "Sound FX" },
] as const;

export type UploadCategorySlug = (typeof UPLOAD_CATEGORIES)[number]["slug"];
