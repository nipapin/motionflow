import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import type { ResultSetHeader } from "mysql2";
import { getPool } from "@/lib/db";
import {
  AFFILIATE_LINK_HITS_TABLE,
  ensureAffiliateSchema,
  getAffiliateBySlug,
} from "@/lib/affiliate/db";
import { AFFILIATE_REF_COOKIE, normalizeAffiliateSlug } from "@/lib/affiliate/shared";

/** Referral slug from the request cookie header (works for `Request` and `NextRequest`). */
export function affiliateRefSlugFromRequest(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== AFFILIATE_REF_COOKIE) continue;
    return normalizeAffiliateSlug(decodeURIComponent(rest.join("=").trim()));
  }
  return null;
}

/** Referral slug inside server components / route handlers using `next/headers`. */
export async function affiliateRefSlugFromCookies(): Promise<string | null> {
  const store = await cookies();
  return normalizeAffiliateSlug(store.get(AFFILIATE_REF_COOKIE)?.value ?? null);
}

/**
 * First-touch attribution on the account: whoever referred the visitor when the
 * account was created (or when they first signed in carrying a referral cookie)
 * keeps the user. The `IS NULL` guard means an existing stamp is never
 * overwritten, so a later partner cannot steal someone else's customer.
 *
 * Called from register, login and the Google callback — an account that already
 * existed before the partner's link was clicked would otherwise never be
 * attributed at all.
 */
export async function attachAffiliateReferralToUser(input: {
  userId: number;
  email: string;
  slug: string | null;
}): Promise<{ attached: boolean; affiliateId?: number }> {
  const slug = normalizeAffiliateSlug(input.slug);
  if (!slug) return { attached: false };

  try {
    const affiliate = await getAffiliateBySlug(slug);
    if (!affiliate || affiliate.status !== "active") return { attached: false };

    // No self-referral: neither the partner's own account nor their own email.
    const email = input.email.trim().toLowerCase();
    if (affiliate.userId === input.userId || affiliate.email === email) {
      return { attached: false };
    }

    const [result] = await getPool().execute<ResultSetHeader>(
      `UPDATE \`users\`
          SET \`referred_by_affiliate_id\` = ?
        WHERE \`id\` = ? AND \`referred_by_affiliate_id\` IS NULL`,
      [affiliate.id, input.userId],
    );
    return result.affectedRows > 0
      ? { attached: true, affiliateId: affiliate.id }
      : { attached: false };
  } catch (err) {
    // Attribution must never break signup or sign-in.
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

export async function recordAffiliateLinkHit(slug: string, ipHash: string | null): Promise<void> {
  await ensureAffiliateSchema();
  await getPool().execute<ResultSetHeader>(
    `INSERT INTO \`${AFFILIATE_LINK_HITS_TABLE}\` (slug, hit_date, ip_hash, created_at)
     VALUES (?, UTC_DATE(), ?, NOW())`,
    [slug, ipHash],
  );
}
