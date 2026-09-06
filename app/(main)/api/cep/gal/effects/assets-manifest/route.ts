import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  loadGalEffectsAssetsManifest,
  parseGalEffectsHost,
} from "@/lib/gal-toolkit-effects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cep/gal/effects/assets-manifest?host=PR|AE
 * Returns `{hostPrefix}/manifest.json` from private bucket `gal-toolkit-max`
 * (e.g. `premiere-pro/manifest.json`). Bearer required.
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
    const loaded = await loadGalEffectsAssetsManifest(host);

    if (!loaded.ok) {
      return NextResponse.json(
        {
          error: loaded.error === "BAD_MANIFEST" ? "BAD_MANIFEST" : "NO_MANIFEST",
          message:
            loaded.error === "BAD_MANIFEST"
              ? "Assets manifest JSON is invalid"
              : "Gal assets manifest not found on R2",
        },
        { status: loaded.error === "BAD_MANIFEST" ? 500 : 404 },
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
        etag: loaded.data.etag,
        manifest: loaded.data.manifest,
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
    console.error("[cep/gal/effects/assets-manifest]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load Gal assets manifest" },
      { status: 500 },
    );
  }
}
