import "server-only";

import type { PoolConnection } from "mysql2/promise";
import {
  PADDLE_TXN_TAX_FLAT,
  PADDLE_TXN_TAX_PERCENT,
} from "@/lib/paddle-laravel-port";
import {
  findAffiliateIdBySubscriptionId,
  getAffiliateById,
  getAffiliateBySlug,
  hasCommissionForBuyer,
  insertAffiliateCommission,
  listCommissionsByPaymentId,
} from "@/lib/affiliate/db";
import { normalizeAffiliateSlug } from "@/lib/affiliate/shared";
import type { Affiliate } from "@/lib/affiliate/types";
import { getPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

/**
 * Money math runs in integer minor units (cents) because Paddle already sends
 * cents and because `round(27.05 * 0.5)` in floats lands on 13.52 instead of the
 * 13.53 the program promises. Half-up on exact halves is what `Math.round` does
 * for positive integers.
 */
export interface AffiliateCommissionBreakdown {
  grossAmount: number;
  paddleFee: number;
  netAmount: number;
  commissionAmount: number;
}

export function computeAffiliateCommission(input: {
  /** Line subtotal the buyer was charged, in cents (after discounts). */
  grossCents: number;
  /** Line total including sales tax, in cents — the basis Paddle charges its fee on. */
  taxedTotalCents: number;
  /** Real Paddle fee in cents when the webhook carries one. */
  feeCents: number | null;
  commissionPercent: number;
}): AffiliateCommissionBreakdown {
  const grossCents = Math.max(0, Math.round(input.grossCents));
  const taxedTotalCents = Math.max(grossCents, Math.round(input.taxedTotalCents || grossCents));

  const feeCents =
    input.feeCents != null && input.feeCents > 0
      ? Math.round(input.feeCents)
      : Math.round(
          (taxedTotalCents * PADDLE_TXN_TAX_PERCENT) / 100 + PADDLE_TXN_TAX_FLAT * 100,
        );

  const netCents = Math.max(0, grossCents - feeCents);
  const commissionCents = Math.round((netCents * input.commissionPercent) / 100);

  return {
    grossAmount: grossCents / 100,
    paddleFee: feeCents / 100,
    netAmount: netCents / 100,
    commissionAmount: commissionCents / 100,
  };
}

/**
 * Motion Flow's own subscription tiers. Author subscriptions (Spunkram,
 * Premiere Gal), extra-generation packs and marketplace sales must never accrue
 * an affiliate commission, so we allowlist the Creator price ids and fall back
 * to the checkout tier when the env vars are not configured.
 */
export function isMotionflowSubscriptionPlan(input: {
  paddlePriceId: string | null;
  tier: string | null;
}): boolean {
  const configured = [
    process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_MONTHLY,
    process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_YEARLY,
    process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_MONTHLY,
    process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_YEARLY,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));

  if (input.paddlePriceId && configured.length > 0) {
    return configured.includes(input.paddlePriceId);
  }
  const tier = input.tier?.trim().toLowerCase();
  return tier === "creator" || tier === "creator_ai";
}

async function loadActiveAffiliate(id: number): Promise<Affiliate | null> {
  const affiliate = await getAffiliateById(id);
  if (!affiliate || affiliate.status !== "active") return null;
  return affiliate;
}

/**
 * Which partner owns this payment. First match wins:
 *
 * 1. an earlier commission on the same `subscription_id` — renewals and upgrades
 *    arrive without `custom_data`, so the subscription stays with the partner who
 *    brought it;
 * 2. `custom_data.affiliate_slug` from the checkout overlay;
 * 3. `users.referred_by_affiliate_id` — the first-touch stamp from signup/login.
 */
export async function resolveAffiliateForPayment(
  conn: PoolConnection | null,
  input: { subscriptionId: string | null; checkoutSlug: string | null; buyerUserId: number },
): Promise<Affiliate | null> {
  if (input.subscriptionId) {
    const lockedId = await findAffiliateIdBySubscriptionId(conn, input.subscriptionId);
    if (lockedId != null) {
      const locked = await loadActiveAffiliate(lockedId);
      if (locked) return locked;
      // Deactivated partner: the tap is closed, including renewals of the
      // subscriptions they brought. Never fall through to another partner.
      return null;
    }
  }

  const slug = normalizeAffiliateSlug(input.checkoutSlug);
  if (slug) {
    const bySlug = await getAffiliateBySlug(slug);
    if (bySlug && bySlug.status === "active" && bySlug.userId !== input.buyerUserId) {
      return bySlug;
    }
  }

  const executor = conn ?? getPool();
  type Row = RowDataPacket & { referred_by_affiliate_id: number | null };
  const [rows] = await executor.execute<Row[]>(
    `SELECT referred_by_affiliate_id FROM \`users\` WHERE id = ? LIMIT 1`,
    [input.buyerUserId],
  );
  const referredBy = rows[0]?.referred_by_affiliate_id;
  if (referredBy == null) return null;

  const affiliate = await loadActiveAffiliate(Number(referredBy));
  if (!affiliate || affiliate.userId === input.buyerUserId) return null;
  return affiliate;
}

export interface AffiliateAccrualInput {
  paymentId: string;
  subscriptionId: string | null;
  buyerUserId: number;
  /** Tier bought: `creator` / `creator_ai`. */
  tier: string | null;
  /** Billing period as stored on `subscription_systems.plan` (monthly / annual). */
  billingPeriod: string | null;
  paddlePriceId: string | null;
  currency: string;
  grossCents: number;
  taxedTotalCents: number;
  feeCents: number | null;
  checkoutSlug: string | null;
}

export type AffiliateAccrualResult =
  | { accrued: true; affiliateId: number; commissionAmount: number }
  | { accrued: false; reason: string };

/**
 * Accrue one commission row for a successful Motion Flow subscription payment.
 * Safe to call for every `transaction.completed`: the unique
 * `(payment_id, affiliate_id)` key makes redelivered webhooks a no-op.
 */
export async function accrueAffiliateCommission(
  conn: PoolConnection | null,
  input: AffiliateAccrualInput,
): Promise<AffiliateAccrualResult> {
  if (!isMotionflowSubscriptionPlan({ paddlePriceId: input.paddlePriceId, tier: input.tier })) {
    return { accrued: false, reason: "not_a_motionflow_plan" };
  }
  if (input.grossCents <= 0) {
    return { accrued: false, reason: "zero_amount" };
  }

  const affiliate = await resolveAffiliateForPayment(conn, {
    subscriptionId: input.subscriptionId,
    checkoutSlug: input.checkoutSlug,
    buyerUserId: input.buyerUserId,
  });
  if (!affiliate) return { accrued: false, reason: "no_affiliate" };

  if (affiliate.recurringMode === "first_only") {
    const already = await hasCommissionForBuyer(conn, affiliate.id, input.buyerUserId);
    if (already) return { accrued: false, reason: "first_only_already_paid" };
  }

  const breakdown = computeAffiliateCommission({
    grossCents: input.grossCents,
    taxedTotalCents: input.taxedTotalCents,
    feeCents: input.feeCents,
    commissionPercent: affiliate.commissionPercent,
  });
  if (breakdown.commissionAmount <= 0) {
    return { accrued: false, reason: "zero_commission" };
  }

  const inserted = await insertAffiliateCommission(conn, {
    affiliateId: affiliate.id,
    buyerUserId: input.buyerUserId,
    paymentId: input.paymentId,
    subscriptionId: input.subscriptionId,
    plan: input.tier,
    billingPeriod: input.billingPeriod,
    grossAmount: breakdown.grossAmount,
    paddleFee: breakdown.paddleFee,
    netAmount: breakdown.netAmount,
    commissionPercent: affiliate.commissionPercent,
    commissionAmount: breakdown.commissionAmount,
    currency: input.currency || "USD",
    status: "approved",
  });
  if (!inserted) return { accrued: false, reason: "already_accrued" };

  return {
    accrued: true,
    affiliateId: affiliate.id,
    commissionAmount: breakdown.commissionAmount,
  };
}

/**
 * Refund / chargeback: add a negative counter-row instead of deleting history,
 * so the admin can see the adjustment and the monthly total nets out.
 */
export async function reverseAffiliateCommissionsForPayment(
  conn: PoolConnection | null,
  paymentId: string,
): Promise<number> {
  const existing = await listCommissionsByPaymentId(conn, paymentId);
  const positives = existing.filter((row) => row.commissionAmount > 0);
  if (positives.length === 0) return 0;

  let reversed = 0;
  for (const row of positives) {
    const inserted = await insertAffiliateCommission(conn, {
      affiliateId: row.affiliateId,
      buyerUserId: row.buyerUserId,
      paymentId: `${paymentId}-refund`,
      subscriptionId: row.subscriptionId,
      plan: row.plan,
      billingPeriod: row.billingPeriod,
      grossAmount: -row.grossAmount,
      paddleFee: -row.paddleFee,
      netAmount: -row.netAmount,
      commissionPercent: row.commissionPercent,
      commissionAmount: -row.commissionAmount,
      currency: row.currency,
      status: "reversed",
    });
    if (inserted) reversed += 1;
  }
  return reversed;
}
