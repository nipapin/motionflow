import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { userOwnsItem } from "@/lib/purchases";
import { hasActiveSubscription } from "@/lib/subscriptions";

export async function GET(req: NextRequest) {
  const itemIdRaw = req.nextUrl.searchParams.get("itemId");
  const itemId = itemIdRaw == null ? NaN : Number(itemIdRaw);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ canDownload: false, error: "invalid itemId" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ canDownload: false });
  }

  const [subOk, owns] = await Promise.all([
    hasActiveSubscription(user.id),
    userOwnsItem(user.id, itemId),
  ]);

  return NextResponse.json({ canDownload: subOk || owns });
}
