import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  getActiveSubscriptionForUser,
  type PricingBillingPeriod,
  type PricingTier,
} from "@/lib/subscriptions";
import {
  scheduleSubscriptionCancellationAtPeriodEnd,
  PaddleApiError,
  getSubscription,
} from "@/lib/paddle-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  tier?: PricingTier;
  billingPeriod?: PricingBillingPeriod;
}

const TIER_RANK: Record<PricingTier, number> = { creator: 1, creator_ai: 2 };

function resolvePriceId(
  tier: PricingTier,
  billingPeriod: PricingBillingPeriod,
): string | null {
  const map: Record<PricingTier, Record<PricingBillingPeriod, string | undefined>> = {
    creator: {
      monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_MONTHLY,
      yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_YEARLY,
    },
    creator_ai: {
      monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_MONTHLY,
      yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_YEARLY,
    },
  };
  return map[tier][billingPeriod] ?? null;
}

/**
 * Tier first, then billing period: monthly < yearly. Same as the pricing UI.
 */
function isDowngrade(
  current: { tier: PricingTier; billingPeriod: PricingBillingPeriod },
  target: { tier: PricingTier; billingPeriod: PricingBillingPeriod },
): boolean {
  const cTier = TIER_RANK[current.tier];
  const tTier = TIER_RANK[target.tier];
  if (tTier < cTier) return true;
  if (tTier > cTier) return false;
  // Same tier: yearly → monthly is a downgrade.
  return current.billingPeriod === "yearly" && target.billingPeriod === "monthly";
}

function billingPeriodToDbPlan(p: PricingBillingPeriod): "monthly" | "annual" {
  return p === "yearly" ? "annual" : "monthly";
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tier = body.tier;
  const billingPeriod = body.billingPeriod;
  if (
    (tier !== "creator" && tier !== "creator_ai") ||
    (billingPeriod !== "monthly" && billingPeriod !== "yearly")
  ) {
    return NextResponse.json({ error: "Invalid plan or billing period" }, { status: 400 });
  }

  const targetPriceId = resolvePriceId(tier, billingPeriod);
  if (!targetPriceId) {
    return NextResponse.json(
      { error: "Target plan is not configured" },
      { status: 500 },
    );
  }

  const current = await getActiveSubscriptionForUser(user.id);
  if (!current) {
    return NextResponse.json(
      { error: "No active subscription to downgrade" },
      { status: 400 },
    );
  }
  if (current.tier === tier && current.billingPeriod === billingPeriod) {
    return NextResponse.json(
      { error: "Already on the requested plan" },
      { status: 400 },
    );
  }
  if (!isDowngrade(current, { tier, billingPeriod })) {
    return NextResponse.json(
      {
        error:
          "This is an upgrade. Use the checkout to upgrade — downgrades are scheduled at period end.",
      },
      { status: 400 },
    );
  }

  // Paddle has no native "swap items at next billing period" call — every
  // PATCH /subscriptions update applies items immediately. The supported
  // pattern for a deferred plan change is therefore:
  //
  //   1. schedule a cancellation at the end of the current billing period
  //      (Paddle stores it as `scheduled_change.action = "cancel"`)
  //   2. remember the user's chosen target plan in our DB
  //   3. when `subscription.canceled` fires we auto-create a new subscription
  //      for the target price via Paddle's transactions API (collection_mode
  //      = automatic, charged to the same customer).
  //
  // Step 1 happens here. Steps 2 (DB write below) and 3 (webhook handler in
  // `lib/paddle-server.ts`) finish the flow.
  let updatedSub: Awaited<ReturnType<typeof scheduleSubscriptionCancellationAtPeriodEnd>>;
  try {
    updatedSub = await scheduleSubscriptionCancellationAtPeriodEnd(
      current.paddleSubscriptionId,
      {
        idempotencyKey: `mf_dg_cancel_${current.paddleSubscriptionId}_${targetPriceId}`,
      },
    );
  } catch (err) {
    if (err instanceof PaddleApiError) {
      console.error("[paddle] schedule downgrade (cancel) failed:", err.status, err.body);
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    console.error("[paddle] schedule downgrade (cancel) unexpected error:", err);
    return NextResponse.json({ error: "Paddle update failed" }, { status: 502 });
  }

  // Re-read so we get the canonical `scheduled_change.effective_at` Paddle
  // computed (= current_billing_period.ends_at).
  let effectiveAt = updatedSub.scheduled_change?.effective_at ?? null;
  if (!effectiveAt) {
    try {
      const fresh = await getSubscription(current.paddleSubscriptionId);
      effectiveAt = fresh.scheduled_change?.effective_at ?? null;
    } catch (err) {
      console.warn("[paddle] re-read of subscription after cancel-schedule failed:", err);
    }
  }

  // Persist the user's intent in our row. We store `action='cancel'` to mirror
  // Paddle (UI / webhook handler key off this) AND the chosen target so we
  // can auto re-subscribe in the cancellation webhook handler. Target product
  // id / name are best-effort lookups — they can be missing for non-catalog
  // prices and we fall back to whatever the post-cancellation transaction
  // payload carries.
  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE \`subscription_systems\`
        SET \`scheduled_change_action\`              = 'cancel',
            \`scheduled_change_effective_at\`        = ?,
            \`scheduled_change_paddle_product_id\`   = NULL,
            \`scheduled_change_paddle_price_id\`     = ?,
            \`scheduled_change_paddle_product_name\` = NULL,
            \`scheduled_change_plan\`                = ?,
            \`updated_at\`                           = NOW()
      WHERE \`subscription_id\` = ? AND \`buyer_id\` = ?`,
    [
      effectiveAt ? new Date(effectiveAt).toISOString().slice(0, 19).replace("T", " ") : null,
      targetPriceId,
      billingPeriodToDbPlan(billingPeriod),
      current.paddleSubscriptionId,
      user.id,
    ],
  );

  return NextResponse.json({
    ok: true,
    effectiveAt,
    tier,
    billingPeriod,
  });
}
