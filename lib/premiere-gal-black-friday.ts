import type { PremiereGalPageSets } from "@/lib/premiere-gal-discount";
import type { PremiereGalPlanId } from "@/lib/premiere-gal-paddle-config";

// Midnight on November 27 in Bangkok.
export const BLACK_FRIDAY_START = Date.UTC(2026, 10, 26, 17);
// Both live Paddle discounts expire at this time.
export const BLACK_FRIDAY_END = Date.UTC(2026, 10, 30, 23, 59);
const enabled = process.env.NEXT_PUBLIC_PREMIERE_GAL_BLACK_FRIDAY_ENABLED !== "false";

export type BlackFridayPhase = "upcoming" | "active" | "inactive";

export function getBlackFridayPhase(now: number): BlackFridayPhase {
  if (!enabled || now >= BLACK_FRIDAY_END) return "inactive";
  return now < BLACK_FRIDAY_START ? "upcoming" : "active";
}

export const BLACK_FRIDAY_DISCOUNTS = {
  yearly: { id: "dsc_01m8bjha8emseqe0zm7trgypye", percent: 40, source: "black-friday" },
  lifetime: { id: "dsc_01m8bjpb9fxk3arcvpcftf5xey", percent: 25, source: "black-friday" },
} as const;

export type PremiereGalOffer = {
  id: string;
  percent: number;
  source: "black-friday" | "account";
};

export function getPremiereGalOffer(
  plan: PremiereGalPlanId | "free",
  phase: BlackFridayPhase,
  accountDiscount: Pick<PremiereGalPageSets, "discount_id" | "discount_percent" | "had_toolkit_max" | "is_beta_tester">,
): PremiereGalOffer | undefined {
  if (plan === "monthly" || plan === "free") return undefined;

  const sale = phase === "active" ? BLACK_FRIDAY_DISCOUNTS[plan] : undefined;
  const { discount_id, discount_percent, had_toolkit_max, is_beta_tester } = accountDiscount;
  const percent = discount_percent ?? 50;
  if (discount_id && (!had_toolkit_max || is_beta_tester) && (!sale || percent > sale.percent)) {
    return { id: discount_id, percent, source: "account" };
  }
  return sale;
}
