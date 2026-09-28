import { NextRequest, NextResponse } from "next/server";
import { getItemShowcasePrefix } from "@/lib/marketplace-showcase-prefix";
import {
  getItemShowcaseCategory,
  resolveShowcaseLocation,
} from "@/lib/spunkram-showcase-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** One showcase category for the item page — the full tree is too big to inline. */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId < 1) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const href = req.nextUrl.searchParams.get("href");
  if (!href) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  const location = await resolveShowcaseLocation(await getItemShowcasePrefix(itemId));
  if (!location) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const category = await getItemShowcaseCategory(itemId, location, href);
    if (!category) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(
      { category },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    console.error("[spunkram/showcase]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
