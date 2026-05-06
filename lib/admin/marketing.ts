import "server-only";

/**
 * Laravel parity lives in Contributor\\Affiliate::adminIndex, Contributor\\Marketing::adminIndex,
 * Admin\\Offer, Admin\\MailingMarketing. Stub module until those flows are ported into Next routes + queries.
 */
export type MarketingStubSection = "affiliate" | "coupons" | "offers" | "mailing_marketing";

export async function marketingStubMeta(section: MarketingStubSection): Promise<{ title: string; hint: string }> {
  const map: Record<MarketingStubSection, { title: string; hint: string }> = {
    affiliate: {
      title: "Affiliate (admin)",
      hint: "Short links and partner analytics — wire MySQL queries from Contributor\\Affiliate::adminIndex next.",
    },
    coupons: {
      title: "Coupons (admin)",
      hint: "Coupon CRUD — wire Contributor\\Marketing::adminIndex coupon branch.",
    },
    offers: {
      title: "Offers",
      hint: "Landing offers editor — wire Admin\\Offer.",
    },
    mailing_marketing: {
      title: "Mailing marketing",
      hint: "Campaign tooling — wire Admin\\MailingMarketing.",
    },
  };
  return map[section];
}
