import { NextRequest, NextResponse } from "next/server";
import { getMarketItemsPage } from "@/lib/market-items";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const slug = params.get("slug") ?? "";
  const beforeIdRaw = params.get("beforeId");
  const limitRaw = params.get("limit");

  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return NextResponse.json({ items: [], hasMore: false }, { status: 400 });
  }

  const limit = Math.min(Math.max(Number(limitRaw) || 20, 1), 50);
  const beforeId = beforeIdRaw ? Number(beforeIdRaw) : undefined;

  const page = await getMarketItemsPage(slug, { limit, beforeId });
  return NextResponse.json(page);
}
