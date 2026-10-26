import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/resolve-request-user";
import { requestHasCepBearer } from "@/lib/auth/resolve-request-user";
import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { ensureMarketAnalyticsSchema } from "@/lib/market-analytics-schema";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { getFavoriteItemIds, toggleFavorite } from "@/lib/favorites";

/** GET /api/favorites — favorite item IDs (cookie or CEP Bearer). */
export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) return NextResponse.json({ ids: [], authenticated: false });

  try {
    const ids = await getFavoriteItemIds(user.id);
    return NextResponse.json({ ids, authenticated: true });
  } catch (e) {
    console.error("[favorites] GET", e);
    return NextResponse.json({ ids: [] }, { status: 500 });
  }
}

/** POST /api/favorites — toggle; body: { itemId: number } */
export async function POST(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { itemId?: number };
  const itemId = Number(body.itemId);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "invalid itemId" }, { status: 400 });
  }

  try {
    const added = await toggleFavorite(user.id, itemId);
    if (added && process.env.MOTIONFLOW_MARKET_ANALYTICS !== "0" && !isAffiliateAdmin(user)) {
      try {
        await ensureMarketAnalyticsSchema();
        await getPool().execute("INSERT INTO market_events (id,user_id,visit_id,action,resource_type,resource_id,path,source) VALUES (?,?,?,'favorite','marketplace_item',?,'/',?)",
          [randomUUID(), user.id, randomUUID(), String(itemId), requestHasCepBearer(req) ? "extension" : "web"]);
      } catch { console.error("[analytics] could not record favorite"); }
    }
    return NextResponse.json({ favorited: added });
  } catch (e) {
    console.error("[favorites] POST", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
