import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/resolve-request-user";
import {
  isAllowedGenerationAssetUrl,
  safeAttachmentFilename,
} from "@/lib/generation-asset-hosts";

export const runtime = "nodejs";

/**
 * Same-origin fetch for generation CDN / delivery URLs so the client can save a blob
 * when upstream CORS blocks browser `fetch(url)`.
 */
export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl?.trim()) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }

  try {
    void new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (!isAllowedGenerationAssetUrl(rawUrl)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const attachmentName = safeAttachmentFilename(
    req.nextUrl.searchParams.get("name"),
  );

  try {
    const upstream = await fetch(rawUrl, { redirect: "follow" });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      console.error(
        "[download-generation-asset] upstream",
        upstream.status,
        text.slice(0, 120),
      );
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        {
          status:
            upstream.status >= 400 && upstream.status < 600
              ? upstream.status
              : 502,
        },
      );
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${attachmentName}"`,
      "Cache-Control": "private, no-store",
    };
    if (contentLength) headers["Content-Length"] = contentLength;

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (e) {
    console.error("[download-generation-asset]", e);
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
