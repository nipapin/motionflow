import { NextRequest, NextResponse } from "next/server";
import { parseCaptionsBrand, resolvePreviewMediaUrl } from "@/lib/captions-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/captions/media/[...path]?brand=gal|spunkram
 *
 * Legacy proxy URL kept for backward compatibility — redirects to the public
 * R2/CDN URL for the requested preview asset. `GET /api/captions` now returns
 * ready-to-use CDN URLs directly, so new clients shouldn't need this route.
 *
 * Public preview assets only: `thumb.png`, `preview.mp4`.
 * Path: Category/CaptionFolder/filename
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Decode each segment (Next may already decode; safe to decodeURIComponent)
  let relative: string;
  try {
    relative = segments.map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const brand = parseCaptionsBrand(req.nextUrl.searchParams.get("brand"));
  const url = resolvePreviewMediaUrl(brand, relative);
  if (!url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(url, 302);
}
