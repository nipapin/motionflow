import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    author: {
      name: video.user?.name ?? "Pexels",
      url: video.user?.url ?? "https://www.pexels.com",
    },
  };
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Pexels is not configured (missing PEXELS_API_KEY)." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim();
  const orientationParam = (searchParams.get("orientation") ?? "").trim();
  const orientation = ALLOWED_ORIENTATIONS.has(orientationParam) ? orientationParam : null;

  const pageRaw = Number(searchParams.get("page") ?? "1");
  const perPageRaw = Number(searchParams.get("perPage") ?? "24");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(Math.floor(pageRaw), 100) : 1;
  const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0 ? Math.min(Math.floor(perPageRaw), 30) : 24;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (orientation) params.set("orientation", orientation);
  if (query) params.set("query", query);

  const endpoint = query
    ? `${PEXELS_API}/videos/search?${params.toString()}`
    : `${PEXELS_API}/videos/popular?${params.toString()}`;

  try {
    const upstream = await fetch(endpoint, {
      headers: {
        Authorization: apiKey,
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("[pexels-videos] upstream error", upstream.status, text);
      return NextResponse.json(
        { error: "Failed to fetch videos from Pexels.", status: upstream.status },
        { status: 502 },
      );
    }

    const json = (await upstream.json()) as PexelsResponse;
    const results = (json.videos ?? []).map(normalizeVideo).filter((video): video is FootageVideo => Boolean(video));
    const total = json.total_results ?? results.length;
    const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;

    return NextResponse.json({
      total,
      totalPages,
      page,
      perPage,
      results,
    } satisfies FootageVideoSearchResult);
  } catch (err) {
    console.error("[pexels-videos] request failed", err);
    return NextResponse.json({ error: "Pexels request failed." }, { status: 500 });
  }
}
