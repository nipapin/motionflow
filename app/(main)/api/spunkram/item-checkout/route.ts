import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getSpunkramStorefrontItems } from "@/lib/market-items";
import { createCheckoutTransaction, getPrice } from "@/lib/paddle-api";
import { getDefaultPaddleEnvironment } from "@/lib/paddle-accounting-config";
import { extractSpunkramPriceIdsFromJsonArgs } from "@/lib/spunkram-paddle-config";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to purchase this pack." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { itemId?: unknown; license?: unknown } | null;
  const itemId = body?.itemId;
  const license = body?.license;
  if (typeof itemId !== "number" || !Number.isSafeInteger(itemId) || itemId <= 0 ||
      (license !== "personal" && license !== "commercial")) {
    return NextResponse.json({ error: "Choose a pack and a valid license." }, { status: 400 });
  }

  try {
    const [item] = await getSpunkramStorefrontItems(itemId);
    if (!item) {
      return NextResponse.json({ error: "This pack is no longer available." }, { status: 404 });
    }

    // Laravel owns these catalog IDs in the shared marketplace table.
    const pricing = extractSpunkramPriceIdsFromJsonArgs(item.json_args);
    const priceId = pricing[license];
    if (!priceId) {
      return NextResponse.json({ error: "This license is currently unavailable." }, { status: 409 });
    }

    const source = { account: "default" as const, environment: await getDefaultPaddleEnvironment() ?? "sandbox" };
    const price = await getPrice(priceId, source);
    if (price.billing_cycle || (price.status && price.status !== "active")) {
      return NextResponse.json({ error: "This one-time price is currently unavailable." }, { status: 409 });
    }

    const licenseNumber = license === "commercial" ? 3 : 1;
    const transaction = await createCheckoutTransaction(priceId, {
      buyer_id: String(user.id),
      author_id: String(item.author_id),
      kind: "spunkram_item",
      item_id: String(item.id),
      itemName: item.name,
      license: licenseNumber,
      item_licenses: { [String(item.id)]: licenseNumber },
    }, source);

    return NextResponse.json({ transactionId: transaction.id });
  } catch (error) {
    console.error("[spunkram-item] checkout unavailable", error);
    return NextResponse.json({ error: "Secure checkout is unavailable. Please try again." }, { status: 503 });
  }
}
