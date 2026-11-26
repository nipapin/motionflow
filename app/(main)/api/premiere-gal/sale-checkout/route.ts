import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getDefaultPaddleCheckoutEnvironment } from "@/lib/paddle-accounting-config";
import { createCheckoutTransaction } from "@/lib/paddle-api";
import { BLACK_FRIDAY_DISCOUNTS, getBlackFridayPhase } from "@/lib/premiere-gal-black-friday";
import { PREMIERE_GAL_PRICE_IDS } from "@/lib/premiere-gal-paddle-config";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to start checkout." }, { status: 401 });

  const body = await request.json().catch(() => null) as { plan?: unknown } | null;
  const plan = body?.plan;
  if (plan !== "yearly" && plan !== "lifetime") {
    return NextResponse.json({ error: "Choose a plan included in the Black Friday sale." }, { status: 400 });
  }

  try {
    const environment = await getDefaultPaddleCheckoutEnvironment();
    if (getBlackFridayPhase(Date.now()) !== "active") {
      return NextResponse.json({ error: "The Black Friday sale is not active. Check the current price before trying again." }, { status: 409 });
    }
    // The promotion uses the live catalog and discount IDs checked in Paddle.
    if (environment !== "production") {
      return NextResponse.json({ error: "Black Friday checkout is unavailable in this payment environment." }, { status: 503 });
    }

    const discountId = BLACK_FRIDAY_DISCOUNTS[plan].id;
    const transaction = await createCheckoutTransaction(PREMIERE_GAL_PRICE_IDS[plan], {
      buyer_id: String(user.id),
      plan,
    }, { account: "default", environment }, discountId);
    if (transaction.discount_id !== discountId) throw new Error("The transaction did not include the sale discount.");

    return NextResponse.json({ transactionId: transaction.id });
  } catch (error) {
    console.error("[premiere-gal] Black Friday checkout unavailable", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not open checkout with the Black Friday discount. Please try again." }, { status: 503 });
  }
}
