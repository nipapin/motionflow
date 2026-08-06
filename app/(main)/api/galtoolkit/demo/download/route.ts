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
 * GET /api/galtoolkit/demo/download?host=PR|AE
 * Redirects to the current public demo zip (CDN / env URL).
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
    if (!manifest?.downloadUrl) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Demo pack not published yet" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const wantsJson = req.nextUrl.searchParams.get("format") === "json";
    if (wantsJson) {
      return NextResponse.json(
        {
          version: manifest.version,
          host: manifest.host,
          url: manifest.downloadUrl,
          expires_in: null,
        },
        { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=30" } },
      );
    }

    const res = NextResponse.redirect(manifest.downloadUrl, 302);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  } catch (err) {
    console.error("[galtoolkit/demo/download]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not start demo download" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
