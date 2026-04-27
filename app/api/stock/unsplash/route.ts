import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNSPLASH_API = "https://api.unsplash.com";
const ALLOWED_ORIENTATIONS = new Set(["landscape", "portrait", "squarish"]);

type UnsplashTag = { type?: string; title?: string };

type UnsplashUser = {
  name?: string;
  username?: string;
  links?: { html?: string };
  profile_image?: { small?: string; medium?: string; large?: string };
};

type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  color?: string;
  blur_hash?: string;
  description?: string | null;
  alt_description?: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  links: { html: string; download?: string; download_location?: string };
  user: UnsplashUser;
  tags?: UnsplashTag[];
  likes?: number;
};

type UnsplashSearchResponse = {
  total: number;
  total_pages: number;
  results: UnsplashPhoto[];
};

export type FootagePhoto = {
  id: string;
  width: number;
  height: number;
  color: string | null;
  blurHash: string | null;
  description: string | null;
  altDescription: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;
    small: string;
    thumb: string;
  };
  htmlLink: string;
  downloadLocation: string | null;
  author: {
    name: string;
    username: string;
    profileUrl: string;
    avatar: string | null;
  };
  tags: string[];
  likes: number;
};

export type FootageSearchResult = {
  total: number;
  totalPages: number;
  page: number;
  perPage: number;
  results: FootagePhoto[];
};

function normalizePhoto(photo: UnsplashPhoto): FootagePhoto {
  const username = photo.user?.username ?? "";
  const profileUrl = photo.user?.links?.html
    ?? (username ? `https://unsplash.com/@${username}?utm_source=motionflow&utm_medium=referral` : "https://unsplash.com");

  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    color: photo.color ?? null,
    blurHash: photo.blur_hash ?? null,
    description: photo.description ?? null,
    altDescription: photo.alt_description ?? null,
    urls: photo.urls,
    htmlLink: photo.links.html,
    downloadLocation: photo.links.download_location ?? null,
    author: {
      name: photo.user?.name ?? username ?? "Unknown",
      username,
      profileUrl,
      avatar: photo.user?.profile_image?.medium ?? photo.user?.profile_image?.small ?? null,
    },
    tags: (photo.tags ?? [])
      .map((t) => t?.title?.trim())
      .filter((t): t is string => Boolean(t && t.length > 0)),
    likes: photo.likes ?? 0,
  };
}

export async function GET(req: NextRequest) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json(
      { error: "Unsplash is not configured (missing UNSPLASH_ACCESS_KEY)." },
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

  const endpoint = query
    ? `${UNSPLASH_API}/search/photos?${params.toString()}&query=${encodeURIComponent(query)}`
    : `${UNSPLASH_API}/photos?${params.toString()}`;

  try {
    const upstream = await fetch(endpoint, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("[unsplash] upstream error", upstream.status, text);
      return NextResponse.json(
        { error: "Failed to fetch from Unsplash.", status: upstream.status },
        { status: 502 },
      );
    }

    const json = (await upstream.json()) as UnsplashSearchResponse | UnsplashPhoto[];

    let payload: FootageSearchResult;
    if (Array.isArray(json)) {
      const results = json.map(normalizePhoto);
      payload = {
        total: results.length,
        totalPages: 1,
        page,
        perPage,
        results,
      };
    } else {
      payload = {
        total: json.total ?? 0,
        totalPages: json.total_pages ?? 0,
        page,
        perPage,
        results: (json.results ?? []).map(normalizePhoto),
      };
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[unsplash] request failed", err);
    return NextResponse.json({ error: "Unsplash request failed." }, { status: 500 });
  }
}
