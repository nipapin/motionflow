import { UPLOAD_CATEGORIES, type UploadCategorySlug } from "@/lib/author/upload-categories";

export type SubCategoryOption = { slug: string; label: string };

const indexSlugs = new Set<string>(UPLOAD_CATEGORIES.map((c) => c.slug));

/** Comma-separated sub_category_slug value for MySQL (max 3 slugs, must exist for index category). */
export function normalizeSubCategoriesForIndex(
  indexSlug: string,
  requested: string[] | undefined,
): string {
  if (!indexSlugs.has(indexSlug)) return "";
  const defs = UPLOAD_SUBCATEGORIES[indexSlug as UploadCategorySlug] ?? [];
  const allowed = new Set(defs.map((d) => d.slug));
  const picked = (requested ?? []).filter((s) => allowed.has(s)).slice(0, MAX_SUB_CATEGORIES);
  return picked.join(",");
}

/** Curated sub-categories for contributor upload (max 3 per item in legacy UI). */
export const UPLOAD_SUBCATEGORIES: Record<UploadCategorySlug, SubCategoryOption[]> = {
  "after-effects": [
    { slug: "titles", label: "Titles" },
    { slug: "transitions", label: "Transitions" },
    { slug: "typography", label: "Typography" },
    { slug: "logo-reveals", label: "Logo reveals" },
    { slug: "openers", label: "Openers" },
    { slug: "elements", label: "Elements" },
    { slug: "backgrounds", label: "Backgrounds" },
    { slug: "infographics", label: "Infographics" },
  ],
  "premiere-pro": [
    { slug: "mogrt", label: "MOGRT" },
    { slug: "presets", label: "Presets" },
    { slug: "transitions", label: "Transitions" },
    { slug: "titles", label: "Titles" },
    { slug: "tools", label: "Tools" },
  ],
  "davinci-resolve": [
    { slug: "titles", label: "Titles" },
    { slug: "transitions", label: "Transitions" },
    { slug: "macros", label: "Macros" },
    { slug: "templates", label: "Templates" },
  ],
  // illustrator: [
  //   { slug: "vectors", label: "Vectors" },
  //   { slug: "icons", label: "Icons" },
  //   { slug: "patterns", label: "Patterns" },
  //   { slug: "brushes", label: "Brushes" },
  // ],
  "stock-audio": [
    { slug: "corporate", label: "Corporate" },
    { slug: "cinematic", label: "Cinematic" },
    { slug: "ambient", label: "Ambient" },
    { slug: "percussion", label: "Percussion" },
  ],
  "sound-fx": [
    { slug: "whooshes", label: "Whooshes" },
    { slug: "impacts", label: "Impacts" },
    { slug: "ui", label: "UI" },
    { slug: "nature", label: "Nature" },
  ],
};

export const MAX_SUB_CATEGORIES = 3;
