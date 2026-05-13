import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// YouTube video IDs are 11 chars from [A-Za-z0-9_-].
const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// Whitelist of YouTube player params we forward into the inner iframe URL.
// Anything else is dropped to keep the surface small and predictable.
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

// Default allow-list for the inner <iframe>; matches what YouTube ships in
// their canonical embed snippet.
const IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildEmbedUrl(id: string, params: URLSearchParams): string {
  const fwd = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (FORWARDED_PARAMS.has(k)) fwd.append(k, v);
  }
  const qs = fwd.toString();
  return `https://www.youtube.com/embed/${id}${qs ? `?${qs}` : ""}`;
}

function renderWrapper(embedUrl: string, id: string): string {
  const safeUrl = escapeHtmlAttr(embedUrl);
  const safeId = escapeHtmlAttr(id);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>YouTube · ${safeId}</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
  iframe { width: 100%; height: 100%; border: 0; display: block; }
</style>
</head>
<body>
<iframe
  src="${safeUrl}"
  title="YouTube video player"
  frameborder="0"
  allow="${IFRAME_ALLOW}"
  allowfullscreen
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
</body>
</html>`;
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

  const embedUrl = buildEmbedUrl(id, params);
  const html = renderWrapper(embedUrl, id);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    // Allow this wrapper to be framed from any origin (CEP panels, etc.).
    "Content-Security-Policy": "frame-ancestors *",
    // No caching while we iterate; flip to e.g. `public, max-age=300` once stable.
    "Cache-Control": "no-store, must-revalidate",
    "Referrer-Policy": "strict-origin-when-cross-origin",
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
