import { NextRequest, NextResponse } from "next/server";
import {
  getPremieregalShowcaseObjectStream,
  resolvePremieregalShowcaseObjectKey,
} from "@/lib/premieregal-showcase-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
} as const;

type RouteContext = { params: Promise<{ key: string[] }> };

async function serve(req: NextRequest, context: RouteContext) {
  const { key: segments } = await context.params;
  const objectKey = resolvePremieregalShowcaseObjectKey(segments ?? []);
  if (!objectKey) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  try {
    const range = req.headers.get("range");
    const obj = await getPremieregalShowcaseObjectStream(objectKey, range);
    if (!obj) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    if (req.method === "HEAD") {
      const headers: Record<string, string> = {
        ...CORS_HEADERS,
        "Content-Type": obj.contentType,
        "Accept-Ranges": obj.acceptRanges,
        "Cache-Control": "public, max-age=86400, immutable",
      };
      if (typeof obj.contentLength === "number") {
        headers["Content-Length"] = String(obj.contentLength);
      }
      if (obj.contentRange) headers["Content-Range"] = obj.contentRange;
      return new NextResponse(null, { status: obj.status, headers });
    }

    const headers: Record<string, string> = {
      ...CORS_HEADERS,
      "Content-Type": obj.contentType,
      "Accept-Ranges": obj.acceptRanges,
      "Cache-Control": "public, max-age=86400, immutable",
    };
    if (typeof obj.contentLength === "number") {
      headers["Content-Length"] = String(obj.contentLength);
    }
    if (obj.contentRange) headers["Content-Range"] = obj.contentRange;

    return new NextResponse(obj.body, { status: obj.status, headers });
  } catch (err) {
    console.error("[premiere-gal/showcase-media]", err);
    return NextResponse.json(
      { error: "Failed to load media" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  return serve(req, context);
}

export async function HEAD(req: NextRequest, context: RouteContext) {
  return serve(req, context);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
