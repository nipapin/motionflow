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
  getPrice,
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

function minorToMajor(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

/**
 * POST /api/subscription/preview-upgrade
 *
 * Returns the Motionflow-formula prorated charge the buyer will see if they
 * confirm the upgrade. We don't use Paddle's preview here — Paddle's
 * `prorated_immediately` math doesn't match our spec
 * (`newPlan − oldPlan × usedDays / days`), so we compute it ourselves from
 * the current sub's billing period + the catalog price of the new plan.
 *
 * The actual charge happens in /api/subscription/upgrade via a non-catalog
 * one-time charge for the same amount we return here, so the modal and the
 * card movement always agree.
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
    return NextResponse.json({ error: "No active subscription" }, { status: 400 });
  }
  if (current.tier === tier && current.billingPeriod === billingPeriod) {
    return NextResponse.json({ error: "Already on the requested plan" }, { status: 400 });
  }
  if (!isUpgrade(current, { tier, billingPeriod })) {
    return NextResponse.json(
      { error: "This is a downgrade. Use schedule-downgrade instead." },
      { status: 400 },
    );
  }

  let sub: Awaited<ReturnType<typeof getSubscription>>;
  let targetPrice: Awaited<ReturnType<typeof getPrice>>;
  try {
    [sub, targetPrice] = await Promise.all([
      getSubscription(current.paddleSubscriptionId),
      getPrice(targetPriceId),
    ]);
  } catch (err) {
    if (err instanceof PaddleApiError) {
      console.error("[paddle] preview-upgrade fetch failed:", err.status, err.body);
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    console.error("[paddle] preview-upgrade unexpected error:", err);
    return NextResponse.json({ error: "Paddle preview failed" }, { status: 502 });
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
  const currencyCode =
    targetPrice.unit_price?.currency_code ??
    currentItem?.price?.unit_price?.currency_code ??
    sub.currency_code ??
    "USD";

  const oldUnitMinor = oldUnitMinorRaw ? Number(oldUnitMinorRaw) : NaN;
  const newUnitMinor = newUnitMinorRaw ? Number(newUnitMinorRaw) : NaN;
  if (!Number.isFinite(oldUnitMinor) || !Number.isFinite(newUnitMinor)) {
    console.error("[paddle] preview-upgrade missing unit prices", {
      oldUnitMinorRaw,
      newUnitMinorRaw,
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

  console.info(`[paddle] preview-upgrade ${current.paddleSubscriptionId} → ${targetPriceId}`, {
    oldPlanMinor,
    newPlanMinor,
    periodStart: period.starts_at,
    periodEnd: period.ends_at,
    usedDays: fee.usedDays,
    unusedDays: fee.unusedDays,
    periodDays: fee.periodDays,
    creditMinor: fee.creditMinor,
    amountMinor: fee.amountMinor,
  });

  return NextResponse.json({
    ok: true,
    currencyCode,
    amountDueToday: minorToMajor(fee.amountMinor),
    subtotalToday: minorToMajor(newPlanMinor),
    creditApplied: minorToMajor(fee.creditMinor),
    taxToday: 0,
    nextBilledAmount: minorToMajor(newPlanMinor),
    nextBilledAt: period.ends_at,
    usedDays: fee.usedDays,
    unusedDays: fee.unusedDays,
    periodDays: fee.periodDays,
  });
}
