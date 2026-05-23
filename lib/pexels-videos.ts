const PEXELS_API = "https://api.pexels.com";
const ALLOWED_ORIENTATIONS = new Set(["landscape", "portrait", "square"]);

type PexelsUser = {
  name?: string;
  url?: string;
};

type PexelsVideoFile = {
  quality?: string;
  file_type?: string;
  width?: number;
  height?: number;
  link?: string;
};

type PexelsVideo = {
  id: number;
  width: number;
  height: number;
  duration?: number;
  image?: string;
  url?: string;
  description?: string | null;
  title?: string | null;
  tags?: Array<string | { name?: string }>;
  user?: PexelsUser;
  video_files?: PexelsVideoFile[];
};

type PexelsResponse = {
  page?: number;
  per_page?: number;
  total_results?: number;
  videos?: PexelsVideo[];
};

export type FootageVideo = {
  id: string;
  width: number;
  height: number;
  duration: number;
  image: string;
  videoUrl: string;
  htmlLink: string;
  description: string | null;
  tags: string[];
  author: {
    name: string;
    url: string;
  };
};

export type FootageVideoSearchResult = {
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
  results: FootageVideo[];
};

export type FetchPexelsVideosOptions = {
  query?: string;
  page?: number;
  perPage?: number;
  orientation?: "landscape" | "portrait" | "square";
  /** ISR for server-side hub previews; default no-store for API routes */
  revalidateSeconds?: number;
};

function normalizeVideoTags(tags: PexelsVideo["tags"]): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of tags) {
    let name: string | null = null;
    if (typeof entry === "string") name = entry.trim() || null;
    else if (entry && typeof entry === "object") name = entry.name?.trim() || null;
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function slugTitleFromPexelsUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const slug = segments[segments.length - 1];
    if (!slug) return null;
    const withoutTrailingId = slug.replace(/-\d+$/, "");
    const base = withoutTrailingId || slug;
    const words = base.replace(/-/g, " ").trim();
    if (!words) return null;
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return null;
  }
}

function videoDescriptionFromPexels(video: PexelsVideo): string | null {
  const d = typeof video.description === "string" ? video.description.trim() : "";
  if (d) return d;
  const title = typeof video.title === "string" ? video.title.trim() : "";
  if (title) return title;
  return slugTitleFromPexelsUrl(video.url);
}

function pickBestVideoFile(videoFiles?: PexelsVideoFile[]): string | null {
  if (!videoFiles || videoFiles.length === 0) return null;

  const mp4Files = videoFiles.filter((file) => {
    const type = file.file_type?.toLowerCase();
    return type?.includes("mp4") && Boolean(file.link);
  });
  const candidates = mp4Files.length > 0 ? mp4Files : videoFiles.filter((file) => Boolean(file.link));
  if (candidates.length === 0) return null;

  const hdCandidate = candidates
    .filter((file) => (file.quality ?? "").toLowerCase() === "hd")
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
  if (hdCandidate?.link) return hdCandidate.link;

  const largest = [...candidates].sort(
    (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
  )[0];
  return largest?.link ?? null;
}

function normalizeVideo(video: PexelsVideo): FootageVideo | null {
  const videoUrl = pickBestVideoFile(video.video_files);
  if (!videoUrl) return null;

  return {
    id: String(video.id),
    width: video.width,
    height: video.height,
    duration: video.duration ?? 0,
    image: video.image ?? "",
    videoUrl,
    htmlLink: video.url ?? "https://www.pexels.com/videos/",
    description: videoDescriptionFromPexels(video),
    tags: normalizeVideoTags(video.tags),
    author: {
      name: video.user?.name ?? "Pexels",
      url: video.user?.url ?? "https://www.pexels.com",
    },
  };
}

export async function fetchPexelsVideos(
  options: FetchPexelsVideosOptions = {},
): Promise<FootageVideoSearchResult> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("Pexels is not configured (missing PEXELS_API_KEY).");
  }

  const query = (options.query ?? "").trim();
  const orientationParam = options.orientation ?? null;
  const orientation =
    orientationParam && ALLOWED_ORIENTATIONS.has(orientationParam) ? orientationParam : null;

  const page = options.page && options.page > 0 ? Math.min(Math.floor(options.page), 100) : 1;
  const perPage =
    options.perPage && options.perPage > 0 ? Math.min(Math.floor(options.perPage), 30) : 24;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (orientation) params.set("orientation", orientation);
  if (query) params.set("query", query);

  const endpoint = query
    ? `${PEXELS_API}/videos/search?${params.toString()}`
    : `${PEXELS_API}/videos/popular?${params.toString()}`;

  const upstream = await fetch(endpoint, {
    headers: { Authorization: apiKey },
    ...(options.revalidateSeconds != null
      ? { next: { revalidate: options.revalidateSeconds } }
      : { cache: "no-store" as const }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    throw new Error(`Pexels upstream error (${upstream.status}): ${text}`);
  }

  const json = (await upstream.json()) as PexelsResponse;
  const results = (json.videos ?? [])
    .map(normalizeVideo)
    .filter((video): video is FootageVideo => Boolean(video));
  const total = json.total_results ?? results.length;
  const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

  return {
    total,
    totalPages,
    page,
    perPage,
    results,
  };
}
