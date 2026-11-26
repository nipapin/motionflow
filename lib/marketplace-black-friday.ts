import type { PricingTier } from "@/lib/subscriptions";

const saleStart = Date.UTC(2026, 10, 26);
// Matches expires_at on both Paddle discounts.
const saleEnd = Date.UTC(2026, 10, 30, 23, 59);

export const MARKETPLACE_ANNUAL_PLANS = {
  creator: {
    dollarPrice: 173,
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_YEARLY,
    discountId: "dsc_01m8bv62f63vpzyqx2yamt4mzb",
    percent: 40,
  },
  creator_ai: {
    dollarPrice: 278,
    priceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_CREATOR_AI_YEARLY,
    discountId: "dsc_01m8bvahxkzna8eqy921x9ng4m",
    percent: 30,
  },
} satisfies Record<PricingTier, { dollarPrice: number; priceId?: string; discountId: string; percent: number }>;

export function marketplaceSalePhase(now: number) {
  return now >= saleStart && now < saleEnd ? "active" : "hidden";
}

export function nextMarketplaceSaleTransition(now: number) {
  return [saleStart, saleEnd].find((time) => time > now);
}

export function marketplaceSaleHost(headers: Headers) {
  const host = (headers.get("x-forwarded-host") || headers.get("host"))
    ?.split(",")[0]?.trim().toLowerCase().replace(/:\d+$/, "");
  const local = process.env.NODE_ENV === "development" &&
    (host === "localhost" || host === "127.0.0.1" || host === "[::1]");
  return { allowed: host === "motionflow.pro" || local, local };
}
