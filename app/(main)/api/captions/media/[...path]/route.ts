import { NextRequest, NextResponse } from "next/server";
import { statSync } from "node:fs";
import {
  createFileWebStream,
  mimeForFilename,
  resolvePreviewMedia,
} from "@/lib/captions-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/captions/media/[...path]
 * Public preview assets only: `thumb.png`, `preview.mp4`
 * Path: Category/CaptionFolder/filename
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Decode each segment (Next may already decode; safe to decodeURIComponent)
  let relative: string;
  try {
    relative = segments.map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const absolute = resolvePreviewMedia(relative);
  if (!absolute) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const size = statSync(absolute).size;
    const fileName = absolute.split(/[/\\]/).pop() ?? "file";
    const headers = new Headers({
      "Content-Type": mimeForFilename(fileName),
      "Content-Length": String(size),
      "Cache-Control": "public, max-age=3600",
    });

    return new NextResponse(createFileWebStream(absolute), {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error("[captions/media] GET", e);
    return NextResponse.json({ error: "Could not read file" }, { status: 500 });
  }
}
