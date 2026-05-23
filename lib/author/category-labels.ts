const SLUG_TO_LABEL: Record<string, string> = {
  "after-effects": "After Effects",
  "premiere-pro": "Premiere Pro",
  "davinci-resolve": "DaVinci Resolve",
  // "illustrator": "Illustrator",
  "stock-audio": "Stock Audio",
  "sound-fx": "Sound FX",
  footages: "Footages",
};

export function indexCategoryLabel(slug: string): string {
  const key = slug?.toLowerCase?.() ?? "";
  return SLUG_TO_LABEL[key] ?? (slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Other");
}
