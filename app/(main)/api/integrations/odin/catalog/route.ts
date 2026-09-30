import { NextRequest, NextResponse } from "next/server";
import { odinCatalogAuthorized, odinManagedPackages } from "@/lib/odin-catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: NextRequest) {
  if (!odinCatalogAuthorized(req.headers.get("authorization"))) return json({ error: "UNAUTHORIZED" }, 401);
  try {
    const packs = await odinManagedPackages();
    return json({ Packages: packs.map(({ id, project }) => ({
      id, name: project.name, pack_name: project.name, version: project.version,
      primary_type: project.host, author: "Premiere Basics", image_url: project.previewUrl || "",
      min_extension_version: project.min_extension_version, min_host_version: project.min_host_version,
    })) });
  } catch { return json({ error: "CATALOG_UNAVAILABLE" }, 503); }
}
