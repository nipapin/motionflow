import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { EXTRA_GEN_PACKS } from "@/lib/extra-generation-packs";
import { getPrice, type PaddleApiAccount } from "@/lib/paddle-api";
import { SPUNKRAM_EXTRA_GEN_PACKS } from "@/lib/spunkram-paddle-config";

export const runtime = "nodejs";

function formatMinor(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Returns per-pack list prices from the Paddle catalog (GET /prices/{id}).
 * Price ids come from `NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_*` in `.env`.
 */
export async function GET(request: Request) {
  const account: PaddleApiAccount =
    new URL(request.url).searchParams.get("account") === "spunkram"
      ? "spunkram"
      : "default";

  if (account !== "spunkram") {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const packs = account === "spunkram" ? SPUNKRAM_EXTRA_GEN_PACKS : EXTRA_GEN_PACKS;

  const items: Array<{
    count: number;
    priceId: string | null;
    label: string | null;
    currency_code: string | null;
  }> = [];

  for (const pack of packs) {
    if (!pack.priceId) {
      items.push({
        count: pack.count,
        priceId: null,
        label: null,
        currency_code: null,
      });
      continue;
    }
    try {
      const p = await getPrice(pack.priceId, { account });
      const amount = p.unit_price?.amount ?? null;
      const cur = p.unit_price?.currency_code ?? "USD";
      const label =
        amount != null && amount !== "" ? formatMinor(amount, cur) : null;
      items.push({
        count: pack.count,
        priceId: pack.priceId,
        label,
        currency_code: cur,
      });
    } catch (e) {
      console.error(
        "[paddle/extra-generation-prices] getPrice failed",
        pack.count,
        e,
      );
      items.push({
        count: pack.count,
        priceId: pack.priceId,
        label: null,
        currency_code: null,
      });
    }
  }

  return NextResponse.json({ items });
}
