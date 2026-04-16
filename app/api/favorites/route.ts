import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  LARAVEL_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/session";
import { getFavoriteItemIds, toggleFavorite } from "@/lib/favorites";
import {
  decryptLaravelCookie,
  readLaravelSessionUserId,
} from "@/lib/auth/laravel-session";

async function getUserId(req: NextRequest): Promise<number | null> {
  const jwtToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (jwtToken) {
    const session = await verifySessionToken(jwtToken);
    if (session) {
      const id = Number(session.sub);
      if (Number.isFinite(id) && id > 0) return id;
    }
  }
  const laravelCookie = req.cookies.get(LARAVEL_COOKIE_NAME)?.value;
  if (laravelCookie) {
    const sessionId = decryptLaravelCookie(laravelCookie);
    if (sessionId) return readLaravelSessionUserId(sessionId);
  }
  return null;
}

/** GET /api/favorites — return array of favorite item IDs for the current user */
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ ids: [] });

  try {
    const ids = await getFavoriteItemIds(userId);
    return NextResponse.json({ ids });
  } catch (e) {
    console.error("[favorites] GET", e);
    return NextResponse.json({ ids: [] }, { status: 500 });
  }
}

/** POST /api/favorites — toggle a favorite; body: { itemId: number } */
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { itemId?: number };
  const itemId = Number(body.itemId);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "invalid itemId" }, { status: 400 });
  }

  try {
    const added = await toggleFavorite(userId, itemId);
    return NextResponse.json({ favorited: added });
  } catch (e) {
    console.error("[favorites] POST", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
