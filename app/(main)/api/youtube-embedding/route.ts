import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// YouTube video IDs are 11 chars from [A-Za-z0-9_-].
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Modern desktop Chrome on Windows. CEP panels run on an old CEF build whose
// default UA gets the "browser not supported" page from YouTube; spoofing a
// recent UA on the server side returns the modern HTML5 embed player instead.
const MODERN_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/127.0.0.0 Safari/537.36";

// Query params we forward to https://www.youtube.com/embed/{id}?...
// `id` is path-only and stripped out.
const FORWARDED_PARAMS = new Set([
  "autoplay",
  "mute",
  "controls",
  "loop",
  "playlist",
  "start",
  "end",
  "rel",
  "modestbranding",
  "playsinline",
  "iv_load_policy",
  "cc_load_policy",
  "cc_lang_pref",
  "hl",
  "fs",
  "disablekb",
  "enablejsapi",
  "origin",
  "widget_referrer",
  "color",
  "list",
  "listType",
]);

function buildUpstreamUrl(id: string, params: URLSearchParams): string {
  const fwd = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (FORWARDED_PARAMS.has(k)) fwd.append(k, v);
  }
  const qs = fwd.toString();
  return `https://www.youtube.com/embed/${id}${qs ? `?${qs}` : ""}`;
}

function injectBaseTag(html: string): string {
  // Inject <base href="https://www.youtube.com/"> so relative URLs inside the
  // proxied page (scripts, styles, XHR endpoints) resolve back to YouTube
  // instead of motionflow.pro.
  const baseTag = '<base href="https://www.youtube.com/">';

  // Drop any pre-existing <base> the upstream might have set.
  html = html.replace(/<base\b[^>]*>/gi, "");

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  }
  return baseTag + html;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const id = params.get("id");

  if (!id || !YT_ID_RE.test(id)) {
    return NextResponse.json(
      { error: "missing or invalid `id` (expected 11-char YouTube video id)" },
      { status: 400 },
    );
  }

  const upstreamUrl = buildUpstreamUrl(id, params);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": MODERN_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua":
          '"Chromium";v="127", "Not)A;Brand";v="99", "Google Chrome";v="127"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Upgrade-Insecure-Requests": "1",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "failed to reach youtube.com" },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `youtube returned ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const upstreamCt = upstream.headers.get("content-type") ?? "";
  if (!upstreamCt.toLowerCase().includes("html")) {
    return NextResponse.json(
      { error: "unexpected upstream content-type" },
      { status: 502 },
    );
  }

  const rawHtml = await upstream.text();
  const html = injectBaseTag(rawHtml);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    // Allow any origin (CEP panels, etc.) to host this in an <iframe>.
    "Content-Security-Policy": "frame-ancestors *",
    // Short cache: YouTube ships frequent player updates.
    "Cache-Control": "public, max-age=300, s-maxage=300",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer-when-downgrade",
  });

  return new NextResponse(html, { status: 200, headers });
}

export async function HEAD(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !YT_ID_RE.test(id)) {
    return new NextResponse(null, { status: 400 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
