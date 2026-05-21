import { AI_TOOLS } from "@/lib/ai-tools";
import { fetchPexelsVideos } from "@/lib/pexels-videos";

export type AiToolPreviewMedia = {
  videoUrl: string;
  posterUrl: string;
};

export type AiToolPreviewsMap = Record<string, AiToolPreviewMedia | null>;

const PREVIEW_REVALIDATE_SECONDS = 60 * 60 * 6;

export async function getAiToolsPreviews(): Promise<AiToolPreviewsMap> {
  if (!process.env.PEXELS_API_KEY) {
    return Object.fromEntries(AI_TOOLS.map((tool) => [tool.href, null]));
  }

  const entries = await Promise.all(
    AI_TOOLS.map(async (tool) => {
      try {
        const data = await fetchPexelsVideos({
          query: tool.pexelsQuery,
          perPage: 1,
          page: 1,
          orientation: "landscape",
          revalidateSeconds: PREVIEW_REVALIDATE_SECONDS,
        });
        const video = data.results[0];
        if (!video) return [tool.href, null] as const;
        return [
          tool.href,
          { videoUrl: video.videoUrl, posterUrl: video.image },
        ] as const;
      } catch (err) {
        console.error(`[ai-tools-previews] ${tool.displayName}`, err);
        return [tool.href, null] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}
