import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getExtraGenPacks } from "@/lib/extra-generation-packs";
import { getPrice, type PaddleApiAccount } from "@/lib/paddle-api";
import { getSpunkramExtraGenPacks } from "@/lib/spunkram-paddle-config";
import { spunkramSourceForBuyer } from "@/lib/paddle-actual";

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
 */
export async function GET(request: Request) {
  const account: PaddleApiAccount =
    new URL(request.url).searchParams.get("account") === "spunkram"
      ? "spunkram"
      : "default";

  const user = await getSessionUser();
  if (account !== "spunkram" && !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = account === "spunkram" ? await spunkramSourceForBuyer(user?.id ?? 0) : { account };

  const packs =
    account === "spunkram" ? getSpunkramExtraGenPacks("environment" in source ? source.environment : undefined) : getExtraGenPacks();

  if (!packs.some((pack) => pack.priceId)) {
    console.error(
      "[paddle/extra-generation-prices] extra generation price ids are missing",
      { account },
    );
  }

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
      const p = await getPrice(pack.priceId, source);
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
