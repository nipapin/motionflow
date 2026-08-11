import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/resolve-request-user";
import {
  getMotionflowGenerationPlan,
  hasActiveMotionflowSubscription,
} from "@/lib/subscriptions";

/**
 * GET /api/me/subscription-status
 * Cookie session or CEP Bearer (`mfcep_…`).
 */
export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ active: false, authenticated: false });
  }
  const [active, generation_plan] = await Promise.all([
    hasActiveMotionflowSubscription(user.id),
    getMotionflowGenerationPlan(user.id),
  ]);
  return NextResponse.json({
    authenticated: true,
    active,
    generation_plan,
  });
}
