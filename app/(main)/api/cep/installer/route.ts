import { NextResponse } from "next/server";
import { readInstallerManifest } from "@/lib/motionflow-installer";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const m = await readInstallerManifest();
    if (!m) return NextResponse.json({ error: "RELEASE_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ schema: m.schema, product: m.product, version: m.version, assets: m.assets.map(a => ({ id: a.id, bytes: a.bytes, sha256: a.sha256, unpackedBytes: a.unpackedBytes, unpackedSha256: a.unpackedSha256, path: `/api/cep/installer/download?asset=${a.id}&version=${m.version}` })), setup: m.setup ? { bytes: m.setup.bytes, sha256: m.setup.sha256, path: "/api/cep/installer/setup" } : undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[cep-installer] Manifest unavailable", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "RELEASE_UNAVAILABLE" }, { status: 503 });
  }
}
