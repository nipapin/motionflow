import { NextRequest, NextResponse } from "next/server";
import {
  identityFromJsonBody,
  requireCaptionsAccess,
} from "@/lib/auth/resolve-captions-user";
import {
  buildCaptionsTree,
  createFileWebStream,
  getCaptionsRoot,
  mimeForFilename,
  parseProjectFileKind,
  readFileBuffer,
  resolveProjectFile,
} from "@/lib/captions-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/captions — JSON tree of categories → captions (previews only).
 * Public — no auth (CEP catalog browsing).
 */
export async function GET() {
  try {
    const tree = buildCaptionsTree();
    return NextResponse.json({
      rootConfigured: Boolean(getCaptionsRoot()),
      ...tree,
    });
  } catch (e) {
    console.error("[captions] GET", e);
    return NextResponse.json(
      { error: "Could not load captions." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/captions — download style file (session or CEP identity + subscription).
 *
 * Body: `{ id: string, file?: "mogrt" | "aep" | "definition", user?: { id, email } }`
 * - mogrt / aep → binary attachment
 * - definition → JSON body (MOGRT clientControls)
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const access = await requireCaptionsAccess(identityFromJsonBody(body));
  if (!access.ok) return access.response;

  const id =
    body && typeof body === "object" && "id" in body
      ? String((body as { id: unknown }).id ?? "").trim()
      : "";
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const fileRaw =
    body && typeof body === "object" && "file" in body
      ? (body as { file: unknown }).file
      : undefined;
  const kind = parseProjectFileKind(fileRaw);
  if (!kind) {
    return NextResponse.json(
      { error: 'file must be "mogrt", "aep", or "definition"' },
      { status: 400 },
    );
  }

  try {
    const project = resolveProjectFile(id, kind);
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
      id,
      kind,
    );

    const encoded = encodeURIComponent(project.filename).replaceAll("'", "%27");

    if (kind === "definition") {
      const raw = await readFileBuffer(project.absolutePath);
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

    const headers = new Headers({
      "Content-Type": mimeForFilename(project.filename),
      "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
    });

    return new NextResponse(createFileWebStream(project.absolutePath), {
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
