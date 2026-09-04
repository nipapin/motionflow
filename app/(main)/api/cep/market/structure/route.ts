import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import { resolveCepPackDownload } from "@/lib/cep-entitlements";
import { loadPackStructureFromR2 } from "@/lib/packages-pack-structure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cep/market/structure?pack_id=
 * Returns plaintext pack settings + content tree from R2 `{stem}/`.
 * Visibility = catalog (signed-in + pack visible); not download-gate.
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

    const packId = Number(req.nextUrl.searchParams.get("pack_id"));
    if (!Number.isFinite(packId) || packId <= 0) {
      return NextResponse.json(
        { error: "MISSING_PARAMS", message: "pack_id required" },
        { status: 400 },
      );
    }

    const cfg =
      getCepClientConfig(user.client) ?? requireCepClientConfig("spunkram-cep");

    const resolved = await resolveCepPackDownload({
      packId,
      cfg,
      viewerEmail: user.email,
    });
    if (!resolved) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Pack not found" },
        { status: 404 },
      );
    }

    const loaded = await loadPackStructureFromR2({
      project: resolved.project,
      author: resolved.author,
    });

    if (!loaded.ok) {
      const status =
        loaded.error === "NO_STRUCTURE"
          ? 409
          : loaded.error === "NO_DOWNLOAD_KEY" || loaded.error === "NO_BUCKET"
            ? 404
            : 409;
      return NextResponse.json(
        {
          error:
            loaded.error === "NO_STRUCTURE"
              ? "NO_STRUCTURE"
              : loaded.error === "NO_BUCKET"
                ? "NO_BUCKET"
                : "NO_DOWNLOAD_KEY",
          message:
            loaded.error === "NO_STRUCTURE"
              ? "No pack JSON on R2 for this pack"
              : loaded.error === "NO_BUCKET"
                ? "Author R2 bucket not configured"
                : "Pack download key missing",
        },
        { status },
      );
    }

    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch.trim() === loaded.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: loaded.etag,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    return NextResponse.json(
      {
        pack_id: loaded.pack_id,
        pack_name: loaded.pack_name,
        version: loaded.version,
        etag: loaded.etag,
        settings: loaded.settings,
        content: loaded.content,
      },
      {
        status: 200,
        headers: {
          ETag: loaded.etag,
          "Cache-Control": "private, max-age=60",
        },
      },
    );
  } catch (err) {
    console.error("[cep/market/structure]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load pack structure" },
      { status: 500 },
    );
  }
}
