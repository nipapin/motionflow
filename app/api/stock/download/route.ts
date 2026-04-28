import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNSPLASH_API = "https://api.unsplash.com";
const PEXELS_API = "https://api.pexels.com";

type Provider = "unsplash" | "pexels";
type Kind = "image" | "video";

type UnsplashPhotoResponse = {
  urls?: {
    raw?: string;
    full?: string;
    regular?: string;
  };
  links?: {
    download_location?: string;
  };
};

type PexelsVideoFile = {
  quality?: string;
  file_type?: string;
  width?: number;
  height?: number;
  link?: string;
};

type PexelsVideoResponse = {
  video_files?: PexelsVideoFile[];
};

function pickBestPexelsVideoLink(videoFiles?: PexelsVideoFile[]): string | null {
  if (!videoFiles || videoFiles.length === 0) return null;

  const mp4 = videoFiles.filter((file) => {
    const type = file.file_type?.toLowerCase();
    return type?.includes("mp4") && Boolean(file.link);
  });
  const candidates = mp4.length > 0 ? mp4 : videoFiles.filter((file) => Boolean(file.link));
  if (candidates.length === 0) return null;

  const hd = candidates
    .filter((file) => (file.quality ?? "").toLowerCase() === "hd")
    .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
  if (hd?.link) return hd.link;

  const highest = [...candidates].sort(
    (a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0),
  )[0];
  return highest?.link ?? null;
}

function inferExtFromType(contentType: string | null): string {
  if (!contentType) return "bin";
  const normalized = contentType.toLowerCase();
  if (normalized.includes("image/jpeg")) return "jpg";
  if (normalized.includes("image/png")) return "png";
  if (normalized.includes("image/webp")) return "webp";
  if (normalized.includes("video/mp4")) return "mp4";
  if (normalized.includes("video/webm")) return "webm";
  return "bin";
}

function inferExtFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.trim().toLowerCase();
    if (!ext || ext.length > 5) return null;
    return ext;
  } catch {
    return null;
  }
}

async function resolveUnsplashDownloadUrl(id: string): Promise<string> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    throw new Error("Unsplash is not configured (missing UNSPLASH_ACCESS_KEY).");
  }

  const detail = await fetch(`${UNSPLASH_API}/photos/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
    cache: "no-store",
  });

  if (!detail.ok) {
    const text = await detail.text();
    throw new Error(`Unsplash photo lookup failed (${detail.status}): ${text}`);
  }

  const json = (await detail.json()) as UnsplashPhotoResponse;
  const downloadLocation = json.links?.download_location;
  const sourceUrl = json.urls?.full ?? json.urls?.regular ?? json.urls?.raw;
  if (!sourceUrl) throw new Error("Unsplash response did not include a downloadable image URL.");

  if (downloadLocation) {
    // Unsplash requires pinging download_location for attribution tracking.
    void fetch(downloadLocation, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      cache: "no-store",
    }).catch((err) => {
      console.warn("[stock-download] Unsplash download_location ping failed", err);
    });
  }

  return sourceUrl;
}

async function resolvePexelsVideoUrl(id: string): Promise<string> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("Pexels is not configured (missing PEXELS_API_KEY).");
  }

  const detail = await fetch(`${PEXELS_API}/videos/videos/${encodeURIComponent(id)}`, {
    headers: {
      Authorization: apiKey,
    },
    cache: "no-store",
  });

  if (!detail.ok) {
    const text = await detail.text();
    throw new Error(`Pexels video lookup failed (${detail.status}): ${text}`);
  }

  const json = (await detail.json()) as PexelsVideoResponse;
  const sourceUrl = pickBestPexelsVideoLink(json.video_files);
  if (!sourceUrl) throw new Error("Pexels response did not include a downloadable video URL.");

  return sourceUrl;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign in to download." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider") as Provider | null;
    const kind = searchParams.get("kind") as Kind | null;
    const id = (searchParams.get("id") ?? "").trim();

    if (!provider || !kind || !id) {
      return NextResponse.json(
        { error: "Missing required query params: provider, kind, id." },
        { status: 400 },
      );
    }

    if (provider === "unsplash" && kind !== "image") {
      return NextResponse.json({ error: "Unsplash downloads support images only." }, { status: 400 });
    }
    if (provider === "pexels" && kind !== "video") {
      return NextResponse.json({ error: "Pexels downloads support videos only." }, { status: 400 });
    }
    if (provider !== "unsplash" && provider !== "pexels") {
      return NextResponse.json({ error: "Unsupported provider." }, { status: 400 });
    }

    const sourceUrl = provider === "unsplash"
      ? await resolveUnsplashDownloadUrl(id)
      : await resolvePexelsVideoUrl(id);

    const upstream = await fetch(sourceUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      console.error("[stock-download] source fetch failed", upstream.status, text);
      return NextResponse.json({ error: "Failed to fetch source file." }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type");
    const ext = inferExtFromUrl(sourceUrl) ?? inferExtFromType(contentType);
    const filename = `motionflow-${provider}-${id}.${ext}`;
    const headers = new Headers();
    headers.set("Content-Type", contentType ?? "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    headers.set("Cache-Control", "no-store");

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[stock-download] request failed", err);
    const message = err instanceof Error ? err.message : "Download request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
