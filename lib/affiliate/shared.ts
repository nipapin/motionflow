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
/** Full `?ref=` value: partner slug, optionally plus `-campaign`. */
const REF_PATTERN = /^[a-z0-9-]{3,80}$/;
const CAMPAIGN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase + trim, then accept only `[a-z0-9-]{3,32}`. Returns null if invalid. */
export function normalizeAffiliateSlug(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const slug = raw.trim().toLowerCase();
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Cookie / query value. `plownik` and `plownik-email-september` are both valid;
 * the partner is resolved later by longest matching slug prefix.
 */
export function normalizeAffiliateRef(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const ref = raw.trim().toLowerCase();
  return REF_PATTERN.test(ref) ? ref : null;
}

/** Extra segment after `{slug}-`. `email-september` → ok; empty / spaces → null. */
export function normalizeAffiliateCampaign(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const campaign = raw.trim().toLowerCase();
  if (!CAMPAIGN_PATTERN.test(campaign) || campaign.length > 48) return null;
  return campaign;
}

export function campaignFromRef(fullRef: string, baseSlug: string): string | null {
  if (fullRef === baseSlug) return null;
  if (!fullRef.startsWith(`${baseSlug}-`)) return null;
  return normalizeAffiliateCampaign(fullRef.slice(baseSlug.length + 1));
}

export const AFFILIATE_SLUG_HINT = "3-32 characters, lowercase letters, digits and dashes";
export const AFFILIATE_CAMPAIGN_HINT =
  "lowercase letters, digits and dashes — e.g. campaign-name";

/**
 * Public login names that always get the admin Partners tab. `users.name` is the
 * username on this site; extra admins come from `AFFILIATE_ADMIN_EMAILS`
 * (server-side only, see `lib/affiliate/admin.ts`).
 */
export const AFFILIATE_ADMIN_USERNAMES = new Set(["ionestudio"]);

/** Public referral link. Campaign becomes `?ref={slug}-{campaign}`. */
export function affiliateRefLink(slug: string, campaign?: string | null): string {
  const ref = campaign ? `${slug}-${campaign}` : slug;
  return `${motionflowSiteOrigin()}/?${AFFILIATE_REF_QUERY_PARAM}=${ref}`;
}
