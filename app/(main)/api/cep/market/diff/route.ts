import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import {
  resolveCepPackDownload,
  userCanDownloadCepPack,
} from "@/lib/cep-entitlements";
import { buildPackDiffZip } from "@/lib/packages-pack-diff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cep/market/diff
 * Body: { pack_id: number, manifest: array | { files: … } }
 * Returns a zip of files that differ from the R2 `{stem}/` tree + updated manifest.json.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or revoked token" },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "BAD_REQUEST", message: "JSON body required" },
        { status: 400 },
      );
    }

    const packId = Number(
      body && typeof body === "object" && "pack_id" in body
        ? (body as { pack_id: unknown }).pack_id
        : NaN,
    );
    if (!Number.isFinite(packId) || packId <= 0) {
      return NextResponse.json(
        { error: "MISSING_PARAMS", message: "pack_id required" },
        { status: 400 },
      );
    }

    const manifest =
      body && typeof body === "object" && "manifest" in body
        ? (body as { manifest: unknown }).manifest
        : null;
    if (manifest == null) {
      return NextResponse.json(
        { error: "MISSING_PARAMS", message: "manifest required" },
        { status: 400 },
      );
    }

    const cfg =
      getCepClientConfig(user.client) ?? requireCepClientConfig("spunkram-cep");

    const gate = await userCanDownloadCepPack({
      userId: user.id,
      packId,
      cfg,
      viewerEmail: user.email,
    });

    if (!gate.ok) {
      const status = gate.error === "NOT_FOUND" ? 404 : 403;
      return NextResponse.json(
        {
          error: gate.error,
          message:
            gate.error === "NOT_FOUND"
              ? "Pack not found"
              : "Purchase or Spunkram subscription required",
        },
        { status },
      );
    }

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

    const built = await buildPackDiffZip({
      project: resolved.project,
      author: resolved.author,
      localManifest: manifest,
    });

    if (!built.ok) {
      const status = built.error === "NO_DIFF_SOURCE" ? 409 : 404;
      return NextResponse.json(
        {
          error: built.error,
          message:
            built.error === "NO_DIFF_SOURCE"
              ? "No R2 content prefix / manifest for this pack; use full zip download"
              : built.error === "NO_BUCKET"
                ? "Author R2 bucket not configured"
                : "Pack download key missing",
        },
        { status },
      );
    }

    const stem = built.stem.replace(/[^a-zA-Z0-9._-]+/g, "_") || "pack";
    return new NextResponse(built.zipStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${stem}-diff.zip"`,
        "X-Diff-Count": String(built.toDownload.length),
        "X-Delete-Count": String(built.toDelete.length),
        "X-Pack-Stem": built.stem,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[cep/market/diff]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not build pack diff" },
      { status: 500 },
    );
  }
}
