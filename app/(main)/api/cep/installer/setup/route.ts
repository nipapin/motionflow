import { NextResponse } from "next/server";
import { installerDownload, readInstallerManifest } from "@/lib/motionflow-installer";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const m = await readInstallerManifest();
    if (!m?.setup) return NextResponse.json({ error: "RELEASE_NOT_FOUND" }, { status: 404 });
    return new Response(await installerDownload(m.setup), { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(m.setup.bytes), "Content-Disposition": `attachment; filename="MotionFlow-Setup-${m.version}.exe"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "ASSET_UNAVAILABLE" }, { status: 503 });
  }
}
