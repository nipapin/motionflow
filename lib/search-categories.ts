export const SIDEBAR_SEARCH_CATEGORIES = [
  "After Effects",
  "Premiere Pro",
  "DaVinci Resolve",
  "Illustrator",
  "Stock Music",
  "Sound FX",
] as const;

export const SEARCH_CATEGORY_OPTIONS = [...SIDEBAR_SEARCH_CATEGORIES] as const;

export const DEFAULT_SEARCH_CATEGORY = SEARCH_CATEGORY_OPTIONS[0];

export type SearchCategory = (typeof SEARCH_CATEGORY_OPTIONS)[number];

const SEARCH_CATEGORY_TO_HREF: Record<(typeof SEARCH_CATEGORY_OPTIONS)[number], string> = {
  "After Effects": "/after-effects",
  "Premiere Pro": "/premiere-pro",
  "DaVinci Resolve": "/davinci-resolve",
  Illustrator: "/illustrator",
  "Stock Music": "/stock-audio",
  "Sound FX": "/sound-fx",
};

export function searchCategoryHref(category: SearchCategory): string | null {
  return SEARCH_CATEGORY_TO_HREF[category] ?? null;
}

export function isSidebarSearchCategory(value: string): value is (typeof SEARCH_CATEGORY_OPTIONS)[number] {
  return SEARCH_CATEGORY_OPTIONS.includes(value as (typeof SEARCH_CATEGORY_OPTIONS)[number]);
}
