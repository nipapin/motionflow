import { NextRequest, NextResponse } from "next/server";
import { installerDownload, readInstallerManifest } from "@/lib/motionflow-installer";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("asset");
  const version = req.nextUrl.searchParams.get("version");
  if (!["cep", "ffmpeg"].includes(id || "") || !/^\d+\.\d+\.\d+$/.test(version || "")) return NextResponse.json({ error: "INVALID_ASSET" }, { status: 400 });
  try {
    const m = await readInstallerManifest();
    if (!m) return NextResponse.json({ error: "RELEASE_NOT_FOUND" }, { status: 404 });
    if (m.version !== version) return NextResponse.json({ error: "RELEASE_CHANGED" }, { status: 409 });
    const asset = m.assets.find(a => a.id === id)!;
    const body = await installerDownload(asset);
    return new Response(body, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(asset.bytes), "Content-Disposition": `attachment; filename="${id === "cep" ? "motionflow.zip" : "ffmpeg.exe.gz"}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[cep-installer-download] Asset unavailable", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "ASSET_UNAVAILABLE" }, { status: 503 });
  }
}
