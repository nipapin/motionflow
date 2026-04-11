/** Maps `pathname` (no trailing slash) to the sidebar item label for link-based nav. */
export const SIDEBAR_LABEL_BY_PATH: Record<string, string> = {
  "/after-effects": "After Effects",
  "/premiere-pro": "Premiere Pro",
  "/davinci-resolve": "DaVinci Resolve",
  "/illustrator": "Illustrator",
  "/stock-music": "Stock Music",
  "/sound-fx": "Sound FX",
  "/image-generation": "Image Gen",
  "/video-generation": "Video Gen",
  "/text-to-speech": "Text to Speech",
  "/speech-to-text": "Speech to Text",
};

export function sidebarLabelForPath(pathname: string): string {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/") return "All";
  return SIDEBAR_LABEL_BY_PATH[normalized] ?? "All";
}
