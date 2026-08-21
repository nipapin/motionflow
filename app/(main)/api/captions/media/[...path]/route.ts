import { NextRequest, NextResponse } from "next/server";
import {
  captionsBrandPrefix,
  parseCaptionsBrand,
  readR2ObjectBuffer,
  resolvePreviewMediaUrl,
} from "@/lib/captions-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/captions/media/[...path]?brand=gal|spunkram
 *
 * Public assets: `thumb.png` / `preview.mp4` → 302 to CDN.
 * `controls.json` → JSON body (CEP fetch; CDN CORS may block the panel).
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

  let relative: string;
  try {
    relative = segments.map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const brand = parseCaptionsBrand(req.nextUrl.searchParams.get("brand"));
  const parts = relative.split("/").filter(Boolean);
  if (parts.length === 3 && parts[2] === "controls.json") {
    const key = [captionsBrandPrefix(brand), parts[0], parts[1], "controls.json"].join("/");
    try {
      const raw = await readR2ObjectBuffer(key);
      return NextResponse.json(JSON.parse(raw.toString("utf8")), {
        headers: { "Cache-Control": "public, max-age=60" },
      });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const url = resolvePreviewMediaUrl(brand, relative);
  if (!url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(url, 302);
}
