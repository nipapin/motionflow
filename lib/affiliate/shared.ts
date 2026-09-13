/**
 * Client/edge-safe affiliate constants. Imported by `proxy.ts` and client
 * components, so this module must not pull in `server-only`, mysql or Node APIs
 * (same reason `packages-admin-client.ts` exists next to `packages-admin.ts`).
 */

/** Last-click referral cookie written when a visitor lands with `?ref=slug`. */
export const AFFILIATE_REF_COOKIE = "mf_aff_ref";

/** Query parameter on the public referral link. */
export const AFFILIATE_REF_QUERY_PARAM = "ref";

/** 30 days, per the affiliate program spec. */
export const AFFILIATE_REF_COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

import { motionflowSiteOrigin } from "@/lib/motionflow-urls";

const SLUG_PATTERN = /^[a-z0-9-]{3,32}$/;

/** Lowercase + trim, then accept only `[a-z0-9-]{3,32}`. Returns null if invalid. */
export function normalizeAffiliateSlug(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export const AFFILIATE_SLUG_HINT = "3-32 characters, lowercase letters, digits and dashes";

/**
 * Public login names that always get the admin Partners tab. `users.name` is the
 * username on this site; extra admins come from `AFFILIATE_ADMIN_EMAILS`
 * (server-side only, see `lib/affiliate/admin.ts`).
 */
export const AFFILIATE_ADMIN_USERNAMES = new Set(["ionestudio"]);

/** Public referral link handed to the partner. */
export function affiliateRefLink(slug: string): string {
  return `${motionflowSiteOrigin()}/?${AFFILIATE_REF_QUERY_PARAM}=${slug}`;
}
