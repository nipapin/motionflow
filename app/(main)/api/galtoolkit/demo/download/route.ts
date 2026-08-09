import { NextRequest, NextResponse } from "next/server";
import {
  getGalToolkitDemoManifest,
  getGalToolkitDemoProject,
  normalizeDemoHost,
  resolveGalToolkitDemoProjectDownloadUrl,
} from "@/lib/galtoolkit-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function isSelfDownloadGate(url: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "") === "/api/galtoolkit/demo/download";
  } catch {
    return /\/api\/galtoolkit\/demo\/download(?:\?|$)/i.test(url);
  }
}

/**
 * GET /api/galtoolkit/demo/download?host=PR|AE
 * Redirects to the archive bound to the free Premiere Gal project for that host
 * (packages_projects.download_key → CDN or short-lived R2 presign).
 */
export async function GET(req: NextRequest) {
  const host = normalizeDemoHost(req.nextUrl.searchParams.get("host"));
  if (!host) {
    return NextResponse.json(
      { error: "MISSING_PARAMS", message: "host=PR|AE required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  try {
    const project = await getGalToolkitDemoProject(host);
    let downloadUrl: string | null = null;
    let version: string | null = null;
    let expiresIn: number | null = null;
    let projectId: number | undefined;

    if (project) {
      downloadUrl = await resolveGalToolkitDemoProjectDownloadUrl(project);
      version =
        (project.version && String(project.version).replace(/^v/i, "").trim()) ||
        project.updated_at.slice(0, 10);
      projectId = project.id;
      const key = project.downloadKey || "";
      if (downloadUrl && !key.startsWith("public/")) {
        expiresIn = 10 * 60;
      }
    }

    if (!downloadUrl) {
      const manifest = await getGalToolkitDemoManifest(host);
      if (manifest?.downloadUrl && !isSelfDownloadGate(manifest.downloadUrl)) {
        downloadUrl = manifest.downloadUrl;
        version = manifest.version;
        projectId = manifest.projectId;
      }
    }

    if (!downloadUrl) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Demo pack not published yet" },
        { status: 404, headers: CORS_HEADERS },
      );
    }

    const wantsJson = req.nextUrl.searchParams.get("format") === "json";
    if (wantsJson) {
      return NextResponse.json(
        {
          version,
          host,
          url: downloadUrl,
          expires_in: expiresIn,
          ...(projectId != null ? { projectId } : {}),
        },
        { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
      );
    }

    const res = NextResponse.redirect(downloadUrl, 302);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    console.error("[galtoolkit/demo/download]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not start demo download" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
