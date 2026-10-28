import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import { parseGalEffectsHost } from "@/lib/gal-toolkit-effects";
import { createGalAssetsArchive, getGalAssetsArchive, removeGalAssetsArchive, GalArchiveError } from "@/lib/gal-assets-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

async function handle(req: NextRequest, action: "create" | "download" | "delete") {
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const headers = { "Cache-Control": "private, no-store" };
    if (action === "create") {
      let body: { host?: string; paths?: unknown; manifest_etag?: unknown };
      try { body = await req.json(); }
      catch { return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 }); }
      if (!body || typeof body !== "object") throw new GalArchiveError("BAD_REQUEST", 400);
      const result = await createGalAssetsArchive({
        userId: user.id, host: parseGalEffectsHost(typeof body.host === "string" ? body.host : null),
        paths: body.paths, manifestEtag: body.manifest_etag, signal: req.signal,
      });
      return NextResponse.json(result, { headers });
    }
    const id = req.nextUrl.searchParams.get("id") || "";
    if (action === "delete") {
      await removeGalAssetsArchive(user.id, id);
      return new NextResponse(null, { status: 204, headers });
    }
    const archive = await getGalAssetsArchive(user.id, id);
    return new NextResponse(archive.body, { headers: {
      ...headers, "Content-Type": "application/gzip", "Content-Length": String(archive.size),
      "Content-Disposition": 'attachment; filename="gal-assets.tar.gz"',
    } });
  } catch (error) {
    if (!(error instanceof GalArchiveError)) console.error("[cep/gal/effects/assets-archive]", error);
    return NextResponse.json({ error: error instanceof GalArchiveError ? error.message : "ARCHIVE_FAILED" },
      { status: error instanceof GalArchiveError ? error.status : 500 });
  }
}

export const POST = (req: NextRequest) => handle(req, "create");
export const GET = (req: NextRequest) => handle(req, "download");
export const DELETE = (req: NextRequest) => handle(req, "delete");
