import { NextRequest, NextResponse } from "next/server";
import { guardStockRequest } from "@/lib/cep-stock-guard";
import { parseUnsplashDownloadLocation, trackUnsplashDownload } from "@/lib/unsplash-download";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const gate = await guardStockRequest(req);
  if ("response" in gate) {
    gate.response.headers.set("Access-Control-Allow-Origin", CORS_HEADERS["Access-Control-Allow-Origin"]);
    return gate.response;
  }

  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = parseUnsplashDownloadLocation(body?.url);
  if (!url) {
    return NextResponse.json({ error: "INVALID_DOWNLOAD_LOCATION" }, { status: 400, headers: CORS_HEADERS });
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json({ error: "UNSPLASH_NOT_CONFIGURED" }, { status: 503, headers: CORS_HEADERS });
  }

  try {
    await trackUnsplashDownload(url, accessKey);
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  } catch (err) {
    console.warn("[stock-track-download] Unsplash request failed", err);
    return NextResponse.json({ error: "UNSPLASH_TRACKING_FAILED" }, { status: 502, headers: CORS_HEADERS });
  }
}
