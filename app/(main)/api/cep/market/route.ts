import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import { buildCepMarketPackages } from "@/lib/cep-entitlements";

export const runtime = "nodejs";

/**
 * GET /api/cep/market?host=AE|PR — author packs with owned/action/urls.
 * Author id is resolved from the device `client`, never from the query.
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

    const hostRaw = (req.nextUrl.searchParams.get("host") || "AE").toUpperCase();
    const host = hostRaw === "PR" ? "PR" : "AE";

    const cfg =
      getCepClientConfig(user.client) ?? requireCepClientConfig("spunkram-cep");

    const payload = await buildCepMarketPackages({
      userId: user.id,
      cfg,
      host,
      viewerEmail: user.email,
    });

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[cep/market]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load market" },
      { status: 500 },
    );
  }
}
