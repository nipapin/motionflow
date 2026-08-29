import { NextRequest, NextResponse } from "next/server";
import {
  bearerFromRequest,
  identityFromJsonBody,
  requireCaptionsAccess,
} from "@/lib/auth/resolve-captions-user";
import {
  buildCaptionsTree,
  createR2ObjectWebStream,
  mimeForFilename,
  parseCaptionsBrand,
  parseProjectFileKind,
  readR2ObjectBuffer,
  resolveProjectFile,
} from "@/lib/captions-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/captions?brand=gal|spunkram — JSON tree of categories → captions
 * (preview CDN URLs only). Public — no auth (CEP catalog browsing).
 * Protected assets (mogrt/aep/definition) are never exposed as URLs.
 */
export async function GET(req: NextRequest) {
  try {
    const brand = parseCaptionsBrand(req.nextUrl.searchParams.get("brand"));
    const tree = await buildCaptionsTree(brand);
    return NextResponse.json({ rootConfigured: true, brand, ...tree });
  } catch (e) {
    console.error("[captions] GET", e);
    return NextResponse.json(
      { error: "Could not load captions." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/captions — download style file (session or CEP Bearer + real subscription).
 *
 * Body: `{ id: string, file?: "mogrt" | "aep" | "definition", brand?: "gal" | "spunkram" }`
 * - CEP: Spunkram author subscription required
 * - Web session: Motionflow Creator subscription required
 * - mogrt / aep → `{Pack}/{Pack}.mogrt|aep` (id = pack name or caption id); falls back to master.*
 * - definition → per-caption JSON body (legacy)
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const access = await requireCaptionsAccess({
    ...identityFromJsonBody(body),
    bearer: bearerFromRequest(req),
  });
  if (!access.ok) return access.response;

  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const brand = parseCaptionsBrand(b.brand);

  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const kind = parseProjectFileKind(b.file);
  if (!kind) {
    return NextResponse.json(
      { error: 'file must be "mogrt", "aep", or "definition"' },
      { status: 400 },
    );
  }

  try {
    const project = await resolveProjectFile(brand, id, kind);
    if (!project) {
      return NextResponse.json(
        {
          error: "Project file not found.",
          code: "PROJECT_NOT_READY",
        },
        { status: 404 },
      );
    }

    console.info(
      "[captions] download",
      access.user.email,
      access.user.id,
      brand,
      id,
      kind,
    );

    const encoded = encodeURIComponent(project.filename).replaceAll("'", "%27");

    if (kind === "definition") {
      const raw = await readR2ObjectBuffer(project.key, project.bucket);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString("utf8"));
      } catch {
        console.error("[captions] invalid definition.json", id);
        return NextResponse.json(
          { error: "definition.json is invalid." },
          { status: 502 },
        );
      }
      return NextResponse.json(parsed, {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
        },
      });
    }

    const stream = await createR2ObjectWebStream(project.key, project.bucket);
    const headers = new Headers({
      "Content-Type": mimeForFilename(project.filename),
      "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
    });

    return new NextResponse(stream, {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error("[captions] POST", e);
    return NextResponse.json(
      { error: "Could not prepare download." },
      { status: 500 },
    );
  }
}
