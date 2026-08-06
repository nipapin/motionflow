import { NextRequest, NextResponse } from "next/server";
import {
  getGalToolkitDemoManifest,
  normalizeDemoHost,
} from "@/lib/galtoolkit-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * GET /api/galtoolkit/demo?host=PR|AE
 * Public demo pack version manifest for Gal Toolkit CEP.
 */
export async function GET(req: NextRequest) {
  const host = normalizeDemoHost(req.nextUrl.searchParams.get("host"));
  if (!host) {
    return NextResponse.json(
      { error: "MISSING_PARAMS", message: "host=PR|AE required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  try {
    const manifest = await getGalToolkitDemoManifest(host);
    if (!manifest) {
      return NextResponse.json(
        {
          version: null,
          host,
          downloadUrl: null,
          updatedAt: null,
        },
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=30" },
        },
      );
    }

    return NextResponse.json(manifest, {
      headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60" },
    });
  } catch (err) {
    console.error("[galtoolkit/demo]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not read demo manifest" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
