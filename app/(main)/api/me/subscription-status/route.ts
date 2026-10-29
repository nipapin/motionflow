import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/resolve-request-user";
import {
  getActiveSubscriptionForUser,
} from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/subscription-status
 * Cookie session or CEP Bearer (`mfcep_…`).
 */
export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ active: false, authenticated: false }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const subscription = await getActiveSubscriptionForUser(user.id);
  const generation_plan = subscription?.tier ?? "none";
  return NextResponse.json({
    authenticated: true,
    active: !!subscription,
    generation_plan,
    subscription,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
