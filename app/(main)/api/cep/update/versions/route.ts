import { NextRequest, NextResponse } from "next/server";
import { resolveCepPermissionContext } from "@/lib/cep-author-permissions";
import {
  cepProductFromClient,
  listCepProductVersionsFromR2,
  readBetaManifestFromR2,
  readLatestManifestFromR2,
} from "@/lib/spunkram-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cep/update/versions — uploaded ZXPs for the caller's brand (admin only).
 */
export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  if (!bearer) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  let context: Awaited<ReturnType<typeof resolveCepPermissionContext>>;
  try {
    context = await resolveCepPermissionContext(bearer);
  } catch {
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!context.permissions.admin) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "Release admin access required." },
      { status: 403 },
    );
  }
  const product = cepProductFromClient(context.cfg.client);

  try {
    const [versions, stable, beta] = await Promise.all([
      listCepProductVersionsFromR2(product),
      readLatestManifestFromR2(product),
      readBetaManifestFromR2(product),
    ]);

    const betas = versions.filter((v) => v.channel === "beta");
    const stables = versions.filter((v) => v.channel === "stable");

    return NextResponse.json(
      {
        product,
        current: {
          stable: stable?.version ?? null,
          beta: beta?.version ?? null,
        },
        versions,
        betas,
        stables,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("[cep/update/versions] failed", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not list versions." },
      { status: 500 },
    );
  }
}
