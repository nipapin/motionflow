import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { isSpunkramSandboxBuyer, spunkramSourceForBuyer } from "@/lib/paddle-actual";
import { createCheckoutTransaction } from "@/lib/paddle-api";
import { getSpunkramExtraGenPacks, SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to buy extra generations." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { count?: unknown } | null;
  if (typeof body?.count !== "number" || !Number.isSafeInteger(body.count) || body.count <= 0) {
    return NextResponse.json({ error: "Choose an extra generations pack." }, { status: 400 });
  }

  try {
    const subscription = await getActiveAuthorSubscription(user.id, SPUNKRAM_AUTHOR_ID);
    if (!subscription.active) {
      return NextResponse.json({ error: "An active Spunkram subscription is required to buy extra generations." }, { status: 403 });
    }

    const source = await spunkramSourceForBuyer(user.id);
    if (source.environment === "sandbox" && !isSpunkramSandboxBuyer(user.id)) {
      return NextResponse.json({ error: "Checkout is unavailable for this account." }, { status: 403 });
    }

    const pack = getSpunkramExtraGenPacks(source.environment).find((pack) => pack.count === body.count);
    if (!pack?.priceId) {
      return NextResponse.json({ error: "This pack is currently unavailable." }, { status: 400 });
    }

    const transaction = await createCheckoutTransaction(pack.priceId, {
      buyer_id: String(user.id),
      author_id: String(SPUNKRAM_AUTHOR_ID),
      kind: "extra_ai_generations",
      generations: String(pack.count),
    }, source);
    return NextResponse.json({ transactionId: transaction.id });
  } catch (error) {
    console.error("[spunkram] extra checkout unavailable", error);
    return NextResponse.json({ error: "Could not open checkout. Please try again." }, { status: 503 });
  }
}
