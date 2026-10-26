import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { parseMarketFilters, readMarketOverview, readMarketHeatmap } from "@/lib/market-analytics-reader";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  if (!isAffiliateAdmin(await getSessionUser())) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const filters = parseMarketFilters(req.nextUrl.searchParams);
  if (!filters) return NextResponse.json({ error: "INVALID_FILTERS" }, { status: 400 });
  try {
    const data = req.nextUrl.searchParams.get("view") === "heatmap"
      ? await readMarketHeatmap(filters.from, filters.to, req.nextUrl.searchParams.get("path") || undefined,
        Number(req.nextUrl.searchParams.get("width")) || undefined, req.nextUrl.searchParams.get("layout") || undefined)
      : await readMarketOverview(filters);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[market-analytics] read failed", error);
    return NextResponse.json({ error: "Could not load analytics. Refresh to try again." }, { status: 500 });
  }
}
