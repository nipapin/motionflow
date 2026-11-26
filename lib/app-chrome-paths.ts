/** Maps `pathname` (no trailing slash) to the sidebar item label for link-based nav. */
export const SIDEBAR_LABEL_BY_PATH: Record<string, string> = {
  "/after-effects": "After Effects",
  "/premiere-pro": "Premiere Pro",
  "/davinci-resolve": "DaVinci Resolve",
  // "/illustrator": "Illustrator",
  "/stock-audio": "Stock Music",
  "/sound-fx": "Sound FX",
  "/footages": "Footages",
  "/ai-tools": "AI Tools",
  "/image-generation": "AI Tools",
  "/svg-generation": "AI Tools",
  "/image-edit": "AI Tools",
  "/video-generation": "AI Tools",
  "/text-to-speech": "AI Tools",
  "/speech-to-text": "AI Tools",
};

export function sidebarLabelForPath(pathname: string): string {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/") return "All";
  return SIDEBAR_LABEL_BY_PATH[normalized] ?? "All";
}
