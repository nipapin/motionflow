import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_HOSTS = [
  "cdn.motionflow.pro",
  "cdn.notionflow.pro",
  process.env.NEXT_PUBLIC_MOTIONFLOW_CDN?.replace(/^https?:\/\//, "").replace(
    /\/$/,
    "",
  ),
  process.env.NEXT_PUBLIC_R2_PUBLIC_CDN?.replace(/^https?:\/\//, "").replace(
    /\/$/,
    "",
  ),
  process.env.R2_PUBLIC_CDN?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
].filter(Boolean) as string[];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  try {
    const range = req.headers.get("range");
    const upstreamHeaders: HeadersInit = {};
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(url, {
      headers: upstreamHeaders,
      redirect: "follow",
    });
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
    const contentLength = upstream.headers.get("content-length");
    const contentRange = upstream.headers.get("content-range");
    const acceptRanges = upstream.headers.get("accept-ranges") ?? "bytes";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": acceptRanges,
      "Cache-Control": "public, max-age=86400, immutable",
    };
    if (contentLength) headers["Content-Length"] = contentLength;
    if (contentRange) headers["Content-Range"] = contentRange;

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
