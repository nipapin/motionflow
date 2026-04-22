import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  getActiveSubscriptionForUser,
  type PricingBillingPeriod,
  type PricingTier,
} from "@/lib/subscriptions";
import {
  PaddleApiError,
  computeMotionflowUpgradeFeeMinor,
  createOneTimeChargeOnSubscription,
  getPrice,
  getSubscription,
  swapSubscriptionItemsWithoutBilling,
} from "@/lib/paddle-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  tier?: PricingTier;
  billingPeriod?: PricingBillingPeriod;
}

const TIER_RANK: Record<PricingTier, number> = { creator: 1, creator_ai: 2 };

const TIER_LABELS: Record<PricingTier, string> = {
  creator: "Creator",
  creator_ai: "Creator + AI",
};

/**
 * Canonical product names exactly as they appear in the Motionflow catalog.
 * Used for the non-catalog one-time upgrade charge so Paddle invoices /
 * receipts say "Motionflow Creator AI" — never anything like
 * "Upgrade to Creator + AI (Annual)" which is just internal jargon.
 */
const PADDLE_CATALOG_NAMES: Record<PricingTier, string> = {
  creator: "Motionflow Creator",
  creator_ai: "Motionflow Creator AI",
};

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

function isUpgrade(
  current: { tier: PricingTier; billingPeriod: PricingBillingPeriod },
  target: { tier: PricingTier; billingPeriod: PricingBillingPeriod },
): boolean {
  const cTier = TIER_RANK[current.tier];
  const tTier = TIER_RANK[target.tier];
  if (tTier > cTier) return true;
  if (tTier < cTier) return false;
  return current.billingPeriod === "monthly" && target.billingPeriod === "yearly";
}

/**
 * POST /api/subscription/upgrade
 *
 * Two-step upgrade flow that bills the Motionflow-formula prorated amount,
 * not Paddle's built-in `prorated_immediately` calculation:
 *
 *   1) Create a one-time charge on the existing subscription with a
 *      non-catalog price equal to:
 *           newPlan − oldPlan × (usedDays / billingPeriodDays)
 *      → Paddle bills the buyer's saved card immediately.
 *
 *   2) Swap subscription items to the new plan with
 *      `proration_billing_mode: "do_not_bill"` so Paddle doesn't bill
 *      anything additional. The next renewal is billed at the new plan
 *      price on the same `current_billing_period.ends_at`.
 *
 * The `subscription_id` is preserved → the existing `subscription_systems`
 * row is upserted on `subscription.updated` (no row duplication, no
 * cancel-and-resubscribe).
 *
 * If step (2) fails after step (1) succeeded, the buyer has paid but is still
 * on the old plan — we surface that via a clear error and they keep the
 * charge as a credit until support intervenes (very rare; both calls hit the
 * same subscription within seconds and Paddle has no consistency issues
 * between them).
 */
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
    return NextResponse.json({ error: "Target plan is not configured" }, { status: 500 });
  }

  const current = await getActiveSubscriptionForUser(user.id);
  if (!current) {
    return NextResponse.json({ error: "No active subscription to upgrade" }, { status: 400 });
  }
  if (current.tier === tier && current.billingPeriod === billingPeriod) {
    return NextResponse.json({ error: "Already on the requested plan" }, { status: 400 });
  }
  if (!isUpgrade(current, { tier, billingPeriod })) {
    return NextResponse.json(
      {
        error: "This is a downgrade. Use POST /api/subscription/schedule-downgrade instead.",
      },
      { status: 400 },
    );
  }

  // Pull the current sub + the target price so we can run the same formula
  // the preview endpoint already showed to the user. The amounts must agree
  // — if they don't, the user gets a different number than the modal said,
  // which is the bug we're fixing.
  let sub: Awaited<ReturnType<typeof getSubscription>>;
  let targetPrice: Awaited<ReturnType<typeof getPrice>>;
  try {
    [sub, targetPrice] = await Promise.all([
      getSubscription(current.paddleSubscriptionId),
      getPrice(targetPriceId),
    ]);
  } catch (err) {
    if (err instanceof PaddleApiError) {
      console.error("[paddle] upgrade pre-fetch failed:", err.status, err.body);
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    console.error("[paddle] upgrade pre-fetch unexpected error:", err);
    return NextResponse.json({ error: "Paddle pre-fetch failed" }, { status: 502 });
  }

  const period = sub.current_billing_period;
  if (!period?.starts_at || !period?.ends_at) {
    return NextResponse.json(
      { error: "Subscription has no current billing period" },
      { status: 409 },
    );
  }

  const currentItem = sub.items?.find((i) => i.recurring !== false) ?? sub.items?.[0];
  const oldUnitMinorRaw = currentItem?.price?.unit_price?.amount;
  const oldQuantity = currentItem?.quantity ?? 1;
  const newUnitMinorRaw = targetPrice.unit_price?.amount;
  const newProductId = targetPrice.product_id;
  const currencyCode =
    targetPrice.unit_price?.currency_code ??
    currentItem?.price?.unit_price?.currency_code ??
    sub.currency_code ??
    "USD";

  const oldUnitMinor = oldUnitMinorRaw ? Number(oldUnitMinorRaw) : NaN;
  const newUnitMinor = newUnitMinorRaw ? Number(newUnitMinorRaw) : NaN;
  if (!Number.isFinite(oldUnitMinor) || !Number.isFinite(newUnitMinor) || !newProductId) {
    console.error("[paddle] upgrade: missing prices/product", {
      oldUnitMinorRaw,
      newUnitMinorRaw,
      newProductId,
    });
    return NextResponse.json({ error: "Unable to read plan prices" }, { status: 502 });
  }

  const oldPlanMinor = oldUnitMinor * oldQuantity;
  const newPlanMinor = newUnitMinor;

  const fee = computeMotionflowUpgradeFeeMinor({
    oldPlanMinor,
    newPlanMinor,
    periodStart: period.starts_at,
    periodEnd: period.ends_at,
  });

  console.info(`[paddle] upgrade ${current.paddleSubscriptionId} → ${targetPriceId}`, {
    oldPlanMinor,
    newPlanMinor,
    usedDays: fee.usedDays,
    unusedDays: fee.unusedDays,
    periodDays: fee.periodDays,
    creditMinor: fee.creditMinor,
    amountMinor: fee.amountMinor,
    currencyCode,
  });

  // Step 1 — bill the formula amount (skip if the formula yields 0; Paddle
  // rejects zero-amount one-time charges).
  if (fee.amountMinor > 0) {
    try {
      await createOneTimeChargeOnSubscription(
        current.paddleSubscriptionId,
        {
          productId: newProductId,
          amountMinor: String(fee.amountMinor),
          currencyCode,
          name: PADDLE_CATALOG_NAMES[tier],
          description: `Prorated upgrade fee: new plan minus credit for ${fee.unusedDays}/${fee.periodDays} unused days on the previous plan.`,
          quantity: 1,
        },
        {
          // Deterministic idempotency key so re-clicks within ~minutes don't
          // double-charge. `subscription_id + target_price + period_start`
          // uniquely identifies this upgrade attempt for this billing window.
          idempotencyKey: `mf_up_charge_${current.paddleSubscriptionId}_${targetPriceId}_${period.starts_at}`,
        },
      );
    } catch (err) {
      if (err instanceof PaddleApiError) {
        console.error("[paddle] upgrade charge failed:", err.status, err.body);
        return NextResponse.json(
          { error: err.message },
          { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
        );
      }
      console.error("[paddle] upgrade charge unexpected error:", err);
      return NextResponse.json({ error: "Failed to charge upgrade fee" }, { status: 502 });
    }
  }

  // Step 2 — swap items WITHOUT billing (we already billed in step 1).
  try {
    await swapSubscriptionItemsWithoutBilling(
      current.paddleSubscriptionId,
      targetPriceId,
      {
        idempotencyKey: `mf_up_swap_${current.paddleSubscriptionId}_${targetPriceId}_${period.starts_at}`,
      },
    );
  } catch (err) {
    if (err instanceof PaddleApiError) {
      console.error("[paddle] upgrade swap failed:", err.status, err.body);
      return NextResponse.json(
        {
          error:
            "Payment succeeded but plan swap failed. Please contact support — your charge will be applied as credit.",
        },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    console.error("[paddle] upgrade swap unexpected error:", err);
    return NextResponse.json(
      {
        error:
          "Payment succeeded but plan swap failed. Please contact support — your charge will be applied as credit.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    amountChargedMajor: fee.amountMinor / 100,
    currencyCode,
  });
}
