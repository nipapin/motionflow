import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  loadGalEffectsCatalog,
  parseGalEffectsHost,
} from "@/lib/gal-toolkit-effects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cep/gal/effects?host=PR|AE
 * Returns Gal Toolkit pack settings + content tree from R2 bucket `gal-toolkit-max`
 * (`premiere-pro/Premiere Pro.json`). Assets are streamed via
 * `/api/cep/gal/effects/media/…` (private bucket proxy).
 *
 * Auth: Bearer required (any registered CEP client; intended for `gal-cep`).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or revoked token" },
        { status: 401 },
      );
    }

    const host = parseGalEffectsHost(req.nextUrl.searchParams.get("host"));
    const loaded = await loadGalEffectsCatalog(host);

    if (!loaded.ok) {
      return NextResponse.json(
        {
          error: loaded.error === "BAD_PACK" ? "BAD_PACK" : "NO_PACK",
          message:
            loaded.error === "BAD_PACK"
              ? "Pack JSON is invalid"
              : "Gal effects pack not found on R2",
        },
        { status: loaded.error === "BAD_PACK" ? 500 : 404 },
      );
    }

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch.trim() === loaded.data.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: loaded.data.etag,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    return NextResponse.json(
      {
        host: loaded.data.host,
        pack_name: loaded.data.pack_name,
        version: loaded.data.version,
        etag: loaded.data.etag,
        settings: loaded.data.settings,
        content: loaded.data.content,
        assets_base_url: loaded.data.assets_base_url,
      },
      {
        status: 200,
        headers: {
          ETag: loaded.data.etag,
          "Cache-Control": "private, max-age=60",
        },
      },
    );
  } catch (err) {
    console.error("[cep/gal/effects]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load Gal effects" },
      { status: 500 },
    );
  }
}
