import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNSPLASH_API = "https://api.unsplash.com";

type UnsplashTag = { type?: string; title?: string };

type UnsplashPhotoDetail = {
  id: string;
  description?: string | null;
  alt_description?: string | null;
  tags?: UnsplashTag[];
  likes?: number;
  views?: number;
  downloads?: number;
  exif?: {
    make?: string | null;
    model?: string | null;
    name?: string | null;
  } | null;
  location?: {
    name?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
};

export type FootagePhotoDetail = {
  id: string;
  description: string | null;
  altDescription: string | null;
  tags: string[];
  likes: number;
  views: number | null;
  downloads: number | null;
  camera: string | null;
  location: string | null;
};

function buildLocation(loc: UnsplashPhotoDetail["location"]): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.country].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return loc.name ?? null;
}

function buildCamera(exif: UnsplashPhotoDetail["exif"]): string | null {
  if (!exif) return null;
  if (exif.name) return exif.name;
  const parts = [exif.make, exif.model].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json(
      { error: "Unsplash is not configured (missing UNSPLASH_ACCESS_KEY)." },
      { status: 500 },
    );
  }

  const { id } = await ctx.params;
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) {
    return NextResponse.json({ error: "Invalid photo id." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${UNSPLASH_API}/photos/${safeId}`, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      cache: "no-store",
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("[unsplash:photo] upstream error", upstream.status, text);
      return NextResponse.json(
        { error: "Failed to fetch photo from Unsplash.", status: upstream.status },
        { status: 502 },
      );
    }

    const json = (await upstream.json()) as UnsplashPhotoDetail;

    const payload: FootagePhotoDetail = {
      id: json.id,
      description: json.description ?? null,
      altDescription: json.alt_description ?? null,
      tags: (json.tags ?? [])
        .map((t) => t?.title?.trim())
        .filter((t): t is string => Boolean(t && t.length > 0)),
      likes: json.likes ?? 0,
      views: typeof json.views === "number" ? json.views : null,
      downloads: typeof json.downloads === "number" ? json.downloads : null,
      camera: buildCamera(json.exif ?? null),
      location: buildLocation(json.location ?? null),
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[unsplash:photo] request failed", err);
    return NextResponse.json({ error: "Unsplash request failed." }, { status: 500 });
  }
}
