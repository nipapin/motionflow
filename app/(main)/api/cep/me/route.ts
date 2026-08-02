import { NextRequest, NextResponse } from "next/server";
import { listDevicesForUser, resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import {
  cepEntitlementsForTier,
  cepManageSubscriptionUrl,
  cepSubscribeUrl,
  resolveCepTier,
} from "@/lib/cep-entitlements";

export const runtime = "nodejs";

/**
 * GET /api/cep/me — Spunkram-scoped profile (no author_id in response).
 * Platform Creator + AI does not set subscription.active.
 * @see CEP/spunkram-library/docs/BACKEND_CEP_API.md §1.4
 */
export async function GET(req: NextRequest) {
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or revoked token" },
        { status: 401 },
      );
    }

    const cfg =
      getCepClientConfig(user.client) ?? requireCepClientConfig("spunkram-cep");

    const [{ tier, subscription, purchases }, devices] = await Promise.all([
      resolveCepTier(user.id, cfg),
      listDevicesForUser(user.id, user.deviceId),
    ]);

    const entitlements = cepEntitlementsForTier(tier, cfg);

    return NextResponse.json({
      user: {
        id: `user_${user.id}`,
        email: user.email,
        name: user.name || undefined,
      },
      tier,
      subscription: {
        active: subscription.active,
        plan: subscription.plan,
        status: subscription.status,
        renews_at: subscription.renews_at,
      },
      purchases,
      entitlements,
      subscribe_url: cepSubscribeUrl(cfg),
      manage_subscription_url: cepManageSubscriptionUrl(cfg),
      devices,
    });
  } catch (err) {
    console.error("[cep/me]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load profile" },
      { status: 500 },
    );
  }
}
