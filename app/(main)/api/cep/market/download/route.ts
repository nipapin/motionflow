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
import { getPackagesProjectDownloadUrl } from "@/lib/packages-download";

export const runtime = "nodejs";

/**
 * GET /api/cep/market/download?pack_id=
 * Server-side gate: author subscription | free pack.
 * Redirects to the project zip (public CDN or private presign).
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

    const downloadUrl = await getPackagesProjectDownloadUrl(
      resolved.project,
      resolved.author,
    );
    if (!downloadUrl) {
      return NextResponse.json(
        { error: "NO_DOWNLOAD", message: "Pack file not available" },
        { status: 404 },
      );
    }

    return NextResponse.redirect(downloadUrl, 302);
  } catch (err) {
    console.error("[cep/market/download]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not start download" },
      { status: 500 },
    );
  }
}
