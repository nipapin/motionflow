import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = [
  "cdn.motionflow.pro",
  process.env.NEXT_PUBLIC_MOTIONFLOW_CDN?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
].filter(Boolean);

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
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: upstream.status });
    }

    const body = upstream.body;
    const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
    const contentLength = upstream.headers.get("content-length");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    };
    if (contentLength) headers["Content-Length"] = contentLength;

    return new NextResponse(body, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
