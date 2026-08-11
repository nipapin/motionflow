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
import { getGenerationsStatus } from "@/lib/generations";
import {
  getMotionflowGenerationPlan,
  hasActiveMotionflowSubscription,
} from "@/lib/subscriptions";

export const runtime = "nodejs";

/**
 * GET /api/cep/me — profile for the CEP / DaVinci client that issued the token.
 *
 * - Author clients (e.g. `spunkram-cep`): Spunkram subscription / packs.
 * - Platform clients (e.g. `motionflow-davinci`): Motion Flow Creator subscription
 *   + generation quota. `subscription.active` = can download marketplace templates.
 *
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

    const hostRaw = (req.nextUrl.searchParams.get("host") || "").toUpperCase();
    const host = hostRaw === "AE" || hostRaw === "PR" ? hostRaw : undefined;

    const devices = await listDevicesForUser(user.id, user.deviceId);

    if (cfg.platformSubscription) {
      const [creatorActive, generationPlan, generations, { purchases }] =
        await Promise.all([
          hasActiveMotionflowSubscription(user.id),
          getMotionflowGenerationPlan(user.id),
          getGenerationsStatus(user.id),
          resolveCepTier(user.id, cfg, { host }),
        ]);

      const tier =
        generationPlan === "creator_ai"
          ? "subscribed"
          : generationPlan === "creator"
            ? "subscribed"
            : purchases.length > 0
              ? "purchased"
              : "free";

      return NextResponse.json({
        user: {
          id: `user_${user.id}`,
          email: user.email,
          name: user.name || undefined,
        },
        client: cfg.client,
        tier,
        subscription: {
          active: creatorActive,
          plan:
            generationPlan === "none"
              ? null
              : generationPlan === "creator_ai"
                ? "Creator + AI"
                : "Creator",
          status: creatorActive ? "active" : "none",
          renews_at: null,
          generation_plan: generationPlan,
        },
        /** Explicit platform flags for DaVinci / marketplace clients */
        platform: {
          marketplace_download: creatorActive,
          generation_plan: generationPlan,
          generations,
        },
        purchases,
        entitlements: {
          free_pack_slots: cfg.freePackSlots,
          ai_generations_limit: generations.effective_limit,
          marketplace_download: creatorActive,
          creator_ai: generationPlan === "creator_ai",
        },
        subscribe_url: cepSubscribeUrl(cfg),
        manage_subscription_url: cepManageSubscriptionUrl(cfg),
        devices,
      });
    }

    const { tier, subscription, purchases } = await resolveCepTier(
      user.id,
      cfg,
      { host },
    );
    const entitlements = cepEntitlementsForTier(tier, cfg, subscription);

    return NextResponse.json({
      user: {
        id: `user_${user.id}`,
        email: user.email,
        name: user.name || undefined,
      },
      client: cfg.client,
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
