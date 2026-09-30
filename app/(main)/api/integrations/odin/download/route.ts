import { NextRequest, NextResponse } from "next/server";
import { odinCatalogAuthorized, odinManagedDownload } from "@/lib/odin-catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: NextRequest) {
  if (!odinCatalogAuthorized(req.headers.get("authorization"))) return json({ error: "UNAUTHORIZED" }, 401);
  const id = Number(req.nextUrl.searchParams.get("pack_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "INVALID_PACK" }, 400);
  try {
    const result = await odinManagedDownload(id);
    return result ? json(result) : json({ error: "NOT_FOUND" }, 404);
  } catch { return json({ error: "DOWNLOAD_UNAVAILABLE" }, 503); }
}
