/** Tab lists for the admin Partners section and the partner Affiliate section. */

export interface AffiliateTab {
  href: string;
  label: string;
}

export const PARTNERS_TABS: readonly AffiliateTab[] = [
  { href: "/profile/partners", label: "Partners" },
  { href: "/profile/partners/payouts", label: "Payouts" },
];

export const AFFILIATE_TABS: readonly AffiliateTab[] = [
  { href: "/profile/affiliate", label: "Overview" },
  { href: "/profile/affiliate/payouts", label: "Payouts" },
];
