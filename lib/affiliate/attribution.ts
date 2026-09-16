import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db";
import {
  AFFILIATE_LINK_HITS_TABLE,
  ensureAffiliateSchema,
  getAffiliateByRef,
  rememberAffiliateCampaign,
} from "@/lib/affiliate/db";
import {
  AFFILIATE_REF_COOKIE,
  campaignFromRef,
  normalizeAffiliateRef,
} from "@/lib/affiliate/shared";
import { motionflowSiteOrigin } from "@/lib/motionflow-urls";

/** Full `?ref=` value from the request cookie (works for `Request` and `NextRequest`). */
export function affiliateRefSlugFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== AFFILIATE_REF_COOKIE) continue;
    return normalizeAffiliateRef(decodeURIComponent(rest.join("=").trim()));
  }
  return null;
}

/** Full referral value inside server components / route handlers using `next/headers`. */
export async function affiliateRefSlugFromCookies(): Promise<string | null> {
  const store = await cookies();
  return normalizeAffiliateRef(store.get(AFFILIATE_REF_COOKIE)?.value ?? null);
}

/**
 * First-touch attribution on the account: whoever referred the visitor when the
 * account was created (or when they first signed in carrying a referral cookie)
 * keeps the user. The `IS NULL` guard means an existing stamp is never
 * overwritten, so a later partner cannot steal someone else's customer.
 *
 * `slug` here is the full cookie value (`plownik` or `plownik-email-september`).
 */
export async function attachAffiliateReferralToUser(input: {
  userId: number;
  email: string;
  slug: string | null;
}): Promise<{ attached: boolean; affiliateId?: number }> {
  const ref = normalizeAffiliateRef(input.slug);
  if (!ref) return { attached: false };

  try {
    const affiliate = await getAffiliateByRef(ref);
    if (!affiliate || affiliate.status !== "active") return { attached: false };

    const email = input.email.trim().toLowerCase();
    if (affiliate.userId === input.userId || affiliate.email === email) {
      return { attached: false };
    }

    const campaign = campaignFromRef(ref, affiliate.slug);
    const [result] = await getPool().execute<ResultSetHeader>(
      `UPDATE \`users\`
          SET \`referred_by_affiliate_id\` = ?,
              \`referred_by_campaign\` = ?
        WHERE \`id\` = ? AND \`referred_by_affiliate_id\` IS NULL`,
      [affiliate.id, campaign, input.userId],
    );
    if (result.affectedRows > 0 && campaign) {
      await rememberAffiliateCampaign(affiliate.id, campaign);
    }
    return result.affectedRows > 0
      ? { attached: true, affiliateId: affiliate.id }
      : { attached: false };
  } catch (err) {
    console.error("[affiliate/attribution] attach failed", err);
    return { attached: false };
  }
}

/** Salted so the hits table cannot be used to reverse-engineer visitor IPs. */
export function hashAffiliateVisitorIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.AUTH_SECRET ?? process.env.APP_KEY ?? "motionflow";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Client IP behind Cloudflare / reverse proxies (mirrors `lib/cep-auth.ts`). */
export function affiliateClientIp(headers: Headers): string | null {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip) return ip;
  }
  return null;
}

/**
 * Host of the page that sent the visitor, from `document.referrer`.
 * The request `Referer` on `/api/affiliate/hit` is this site itself, so the
 * client must send the browser referrer in the POST body.
 */
export function affiliateReferrerHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!host) return null;
    const siteHost = new URL(motionflowSiteOrigin()).hostname.toLowerCase();
    if (host === siteHost || host.endsWith(`.${siteHost}`)) return null;
    return host.slice(0, 191);
  } catch {
    return null;
  }
}

export async function recordAffiliateLinkHit(input: {
  slug: string;
  campaign: string | null;
  ipHash: string | null;
  referrerHost: string | null;
}): Promise<void> {
  await ensureAffiliateSchema();
  await getPool().execute<ResultSetHeader>(
    `INSERT INTO \`${AFFILIATE_LINK_HITS_TABLE}\`
       (slug, campaign, hit_date, ip_hash, referrer_host, created_at)
     VALUES (?, ?, UTC_DATE(), ?, ?, NOW())`,
    [input.slug, input.campaign, input.ipHash, input.referrerHost],
  );
}
