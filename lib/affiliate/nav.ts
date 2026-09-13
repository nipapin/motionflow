import "server-only";

import { cache } from "react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { getAffiliateForUser } from "@/lib/affiliate/db";

export interface AffiliateNavFlags {
  /** Admin "Partners" section. */
  showPartners: boolean;
  /** Partner "Affiliate" section. */
  showAffiliate: boolean;
}

/**
 * Nav visibility for the profile shell and sidebar. `cache` dedupes the lookup
 * between the two layouts that render on the same request.
 */
export const affiliateNavFlags = cache(async (): Promise<AffiliateNavFlags> => {
  const user = await getSessionUser();
  if (!user) return { showPartners: false, showAffiliate: false };

  const showPartners = isAffiliateAdmin(user);
  let showAffiliate = false;
  try {
    showAffiliate = (await getAffiliateForUser(user)) != null;
  } catch (err) {
    // A missing affiliate schema must not take down every profile page.
    console.error("[affiliate/nav] lookup failed", err);
  }
  return { showPartners, showAffiliate };
});
