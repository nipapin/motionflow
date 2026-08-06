import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import {
  getGalToolkitDemoManifest,
  listGalToolkitDemoVersionsFromR2,
  normalizeDemoHost,
  publishGalToolkitDemoPointer,
  writeGalToolkitDemoManifest,
  buildGalToolkitDemoManifest,
} from "@/lib/galtoolkit-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const host = normalizeDemoHost(req.nextUrl.searchParams.get("host"));
  if (!host) {
    return NextResponse.json({ error: "MISSING_HOST" }, { status: 400 });
  }
  const [manifest, versions] = await Promise.all([
    getGalToolkitDemoManifest(host),
    listGalToolkitDemoVersionsFromR2(host).catch(() => []),
  ]);
  return NextResponse.json({ host, manifest, versions });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: {
    host?: string;
    version?: string;
    name?: string;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const host = normalizeDemoHost(body.host);
  if (!host) {
    return NextResponse.json({ error: "MISSING_HOST" }, { status: 400 });
  }

  try {
    const existing = await getGalToolkitDemoManifest(host);
    const version = (body.version || existing?.version || "").replace(/^v/i, "");
    if (!version) {
      return NextResponse.json({ error: "MISSING_VERSION" }, { status: 400 });
    }

    if (body.version && body.version !== existing?.version) {
      const manifest = await publishGalToolkitDemoPointer({
        host,
        version,
        name: body.name ?? existing?.name,
        description: body.description ?? existing?.description,
      });
      return NextResponse.json({ manifest });
    }

    const manifest = await writeGalToolkitDemoManifest(
      buildGalToolkitDemoManifest({
        host,
        version,
        downloadUrl: existing?.downloadUrl,
        name: body.name ?? existing?.name,
        description: body.description ?? existing?.description,
      }),
    );
    return NextResponse.json({ manifest });
  } catch (err) {
    console.error("[studio/packages/demo PATCH]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
