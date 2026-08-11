import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/resolve-request-user";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { getMarketItemsByIds } from "@/lib/market-items";
import { userOwnsItem } from "@/lib/purchases";
import { hasActiveMotionflowSubscription } from "@/lib/subscriptions";

/**
 * GET /api/me/can-download?itemId=
 * Cookie session or CEP Bearer (`mfcep_…`).
 */
export async function GET(req: NextRequest) {
  const itemIdRaw = req.nextUrl.searchParams.get("itemId");
  const itemId = itemIdRaw == null ? NaN : Number(itemIdRaw);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json(
      { canDownload: false, error: "invalid itemId" },
      { status: 400 },
    );
  }

  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ canDownload: false, authenticated: false });
  }

  const products = await getMarketItemsByIds([itemId]);
  const product = products[0];
  const freePack =
    product != null &&
    (product.discount_price != null
      ? Number(product.discount_price)
      : Number(product.price)) <= 0;

  const [subOk, owns, authorSub] = await Promise.all([
    hasActiveMotionflowSubscription(user.id),
    userOwnsItem(user.id, itemId),
    product
      ? getActiveAuthorSubscription(user.id, product.author_id)
      : Promise.resolve({ active: false }),
  ]);

  return NextResponse.json({
    authenticated: true,
    canDownload: subOk || owns || authorSub.active || freePack,
  });
}
