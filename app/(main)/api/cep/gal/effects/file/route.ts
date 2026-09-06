import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getGalEffectsFilePresign,
  parseGalEffectsHost,
} from "@/lib/gal-toolkit-effects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cep/gal/effects/file?host=PR|AE&path={rel under hostPrefix}
 * Returns a short-lived R2 presigned URL for a Gal Toolkit file
 * (projects, `_Assets`, etc.). Bearer required — not the public media proxy.
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
    const pathParam = req.nextUrl.searchParams.get("path") || "";
    if (!pathParam.trim()) {
      return NextResponse.json(
        { error: "MISSING_PARAMS", message: "path required" },
        { status: 400 },
      );
    }

    const result = await getGalEffectsFilePresign(pathParam, host);
    if (!result.ok) {
      const status =
        result.error === "BAD_PATH"
          ? 400
          : result.error === "PRESIGN_FAILED"
            ? 500
            : 404;
      const message =
        result.error === "BAD_PATH"
          ? "Invalid path"
          : result.error === "PRESIGN_FAILED"
            ? "Could not create download URL"
            : "File not found on R2";
      return NextResponse.json(
        { error: result.error, message },
        { status },
      );
    }

    return NextResponse.json(
      {
        url: result.data.url,
        key: result.data.key,
        path: result.data.path,
        etag: result.data.etag,
        size: result.data.size,
        expires_in: result.data.expires_in,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (err) {
    console.error("[cep/gal/effects/file]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not resolve Gal file download" },
      { status: 500 },
    );
  }
}
