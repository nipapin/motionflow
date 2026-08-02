import { NextRequest, NextResponse } from "next/server";
import {
  bearerFromRequest,
  resolveCaptionsUser,
} from "@/lib/auth/resolve-captions-user";
import { isSpunkramReleaseAdmin } from "@/lib/spunkram-beta";
import {
  listSpunkramVersionsFromR2,
  readBetaManifestFromR2,
  readLatestManifestFromR2,
} from "@/lib/spunkram-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cep/update/versions — full list of uploaded Spunkram ZXPs (admin only).
 * Auth: Bearer CEP token; email must be on the beta/admin allowlist.
 */
export async function GET(req: NextRequest) {
  const bearer = bearerFromRequest(req);
  if (!bearer) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  let email: string | null = null;
  try {
    const user = await resolveCaptionsUser({ bearer });
    email = user?.email ?? null;
  } catch {
    email = null;
  }

  if (!isSpunkramReleaseAdmin(email)) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Release admin access required." },
      { status: 403 },
    );
  }

  try {
    const [versions, stable, beta] = await Promise.all([
      listSpunkramVersionsFromR2(),
      readLatestManifestFromR2(),
      readBetaManifestFromR2(),
    ]);

    const betas = versions.filter((v) => v.channel === "beta");
    const stables = versions.filter((v) => v.channel === "stable");

    return NextResponse.json(
      {
        current: {
          stable: stable?.version ?? null,
          beta: beta?.version ?? null,
        },
        versions,
        betas,
        stables,
      },
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch (err) {
    console.error("[cep/update/versions] failed", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not list versions." },
      { status: 500 },
    );
  }
}
