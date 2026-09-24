import { NextRequest, NextResponse } from "next/server";
import { listPackFontFiles, parseCaptionsBrand } from "@/lib/captions-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/captions/fonts?brand=gal|spunkram&pack=Base
 *
 * Public list of `{Brand} Captions/{Pack}/Fonts/*.{ttf,otf,ttc}` on the CDN bucket.
 * CEP installs these with the caption group. Missing folder → `{ files: [] }`.
 */
export async function GET(req: NextRequest) {
  const brand = parseCaptionsBrand(req.nextUrl.searchParams.get("brand"));
  const pack = req.nextUrl.searchParams.get("pack")?.trim() ?? "";
  if (!pack) {
    return NextResponse.json({ error: "pack is required" }, { status: 400 });
  }

  try {
    const files = await listPackFontFiles(brand, pack);
    if (!files) {
      return NextResponse.json({ error: "invalid pack" }, { status: 400 });
    }
    return NextResponse.json(
      { brand, pack, files },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch (e) {
    console.error("[captions] fonts GET", e);
    return NextResponse.json({ error: "Could not list fonts." }, { status: 500 });
  }
}
