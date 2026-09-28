import { NextRequest, NextResponse } from "next/server";
import { resolveItemShowcasePrefix } from "@/lib/item-showcase-source";
import {
  getShowcaseObjectStream,
  resolveShowcaseLocation,
  resolveShowcaseObjectKey,
} from "@/lib/spunkram-showcase-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
} as const;

type RouteContext = { params: Promise<{ id: string; key: string[] }> };

function notFound() {
  return NextResponse.json(
    { error: "NOT_FOUND" },
    { status: 404, headers: CORS_HEADERS },
  );
}

async function serve(req: NextRequest, context: RouteContext) {
  const { id, key: segments } = await context.params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId < 1) return notFound();

  const location = await resolveShowcaseLocation(await resolveItemShowcasePrefix(itemId));
  if (!location) return notFound();

  const objectKey = resolveShowcaseObjectKey(location, segments ?? []);
  if (!objectKey) return notFound();

  try {
    const obj = await getShowcaseObjectStream(
      location,
      objectKey,
      req.headers.get("range"),
    );
    if (!obj) return notFound();

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

    if (req.method === "HEAD") {
      return new NextResponse(null, { status: obj.status, headers });
    }
    return new NextResponse(obj.body, { status: obj.status, headers });
  } catch (err) {
    console.error("[spunkram/showcase-media]", err);
    return NextResponse.json(
      { error: "MEDIA_FAILED" },
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
