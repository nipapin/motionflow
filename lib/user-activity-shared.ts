/** Admin activity deliberately excludes prompts, tokens, signed URLs and raw errors. */
export const ACTIVITY_CATEGORIES = ["download", "generation", "extension"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export type ActivityStatus = "requested" | "issued" | "failed" | "observed" | "ok" | "unknown";
export type ActivitySource = "web" | "extension" | "unknown";
export type ActivityDetails = {
  delivery?: "redirect" | "stream" | "json";
  httpStatus?: number;
  provider?: string;
  mediaKind?: string;
  brand?: string;
  fileKind?: string;
  version?: string | null;
  previousVersion?: string | null;
  client?: string;
  host?: string;
};
export type UserActivityEntry = {
  id: string;
  category: ActivityCategory;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  source: ActivitySource;
  deviceId: string | null;
  status: ActivityStatus;
  details: ActivityDetails;
  /** Database wall clock, deliberately without an invented UTC offset. */
  createdAt: string;
};
export type UserActivityPage = {
  entries: UserActivityEntry[];
  nextCursor: string | null;
  unavailableSources: string[];
};

export const activityActionLabels: Record<string, string> = {
  marketplace_download: "Catalog download",
  pack_download: "Extension pack download",
  pack_update_download: "Extension pack update download",
  effect_file_download: "Effect file link requested",
  stock_download: "Stock media download",
  caption_download: "Caption style download",
  generation_asset_download: "Generated file download",
  generation: "AI generation",
  pack_installed: "Pack detected on device",
  pack_updated: "Pack version changed",
  pack_removed: "Pack no longer on device",
  pack_activated: "Pack reported active",
  pack_deactivated: "Pack no longer active",
  extension_session: "Extension session reported",
};
export const activityStatusLabels: Record<ActivityStatus, string> = {
  requested: "Requested", issued: "File / link issued", failed: "Failed",
  observed: "Reported by extension", ok: "Completed", unknown: "Legacy request",
};
export const activityToolLabels: Record<string, string> = {
  image: "Image generation", image_edit: "Image editing", image_remove_bg: "Background removal",
  image_upscale: "Image upscaling", svg: "SVG generation", video: "Video generation",
  tts: "Text to speech", stt: "Speech to text", captions: "Captions", chapters: "Chapters",
  sections: "Sections", caption_highlights: "Caption highlights",
};
