import { NextResponse } from "next/server";
import { affiliateRefSlugFromCookies } from "@/lib/affiliate/attribution";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { MARKETPLACE_ANNUAL_PLANS, marketplaceSaleHost, marketplaceSalePhase } from "@/lib/marketplace-black-friday";
import { getDefaultPaddleCheckoutEnvironment } from "@/lib/paddle-accounting-config";
import { createCheckoutTransaction } from "@/lib/paddle-api";
import { getActiveSubscriptionForUser } from "@/lib/subscriptions";

export async function POST(request: Request) {
  if (!marketplaceSaleHost(request.headers).allowed || marketplaceSalePhase(Date.now()) !== "active") {
    return NextResponse.json({ error: "The Black Friday sale is not active here. Refresh to check current prices." }, { status: 409 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to start checkout." }, { status: 401 });

  const body = await request.json().catch(() => null) as { plan?: unknown } | null;
  const plan = body?.plan;
  if (plan !== "creator" && plan !== "creator_ai") {
    return NextResponse.json({ error: "Choose one of the annual Black Friday plans." }, { status: 400 });
  }

  try {
    const [currentSubscription, environment, affiliateSlug] = await Promise.all([
      getActiveSubscriptionForUser(user.id),
      getDefaultPaddleCheckoutEnvironment(),
      affiliateRefSlugFromCookies(),
    ]);
    if (currentSubscription) {
      return NextResponse.json({ error: "Manage your active subscription from the pricing page." }, { status: 409 });
    }
    const { priceId, discountId } = MARKETPLACE_ANNUAL_PLANS[plan];
    if (environment !== "production" || !priceId) {
      return NextResponse.json({ error: "Black Friday checkout is unavailable in this payment environment." }, { status: 503 });
    }
    if (marketplaceSalePhase(Date.now()) !== "active") {
      return NextResponse.json({ error: "The Black Friday sale has ended. Refresh to check current prices." }, { status: 409 });
    }

    const transaction = await createCheckoutTransaction(priceId, {
      buyer_id: String(user.id),
      plan,
      billingPeriod: "yearly",
      ...(affiliateSlug ? { affiliate_slug: affiliateSlug } : {}),
    }, { account: "default", environment }, discountId);
    if (transaction.discount_id !== discountId) throw new Error("Paddle did not apply the sale discount");

    return NextResponse.json({ transactionId: transaction.id });
  } catch (error) {
    console.error("[marketplace] Black Friday checkout unavailable", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not open checkout with the Black Friday discount. Please try again." }, { status: 503 });
  }
}
