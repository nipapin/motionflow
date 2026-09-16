import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  affiliateClientIp,
  affiliateReferrerHost,
  affiliateRefSlugFromRequest,
  attachAffiliateReferralToUser,
  hashAffiliateVisitorIp,
  recordAffiliateLinkHit,
} from "@/lib/affiliate/attribution";
import { getAffiliateByRef, rememberAffiliateCampaign } from "@/lib/affiliate/db";
import {
  AFFILIATE_REF_COOKIE,
  campaignFromRef,
  normalizeAffiliateRef,
} from "@/lib/affiliate/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public referral-link ping from `AffiliateRefTracker`. `proxy.ts` writes the
 * cookie without touching MySQL, so this is where the slug is actually verified:
 * unknown or deactivated partners get their cookie cleared instead of silently
 * shadowing a later valid referral.
 */
export async function POST(req: NextRequest) {
  let rawRef: string | null = null;
  let referrer: string | null = null;
  try {
    const body = (await req.json()) as { ref?: unknown; slug?: unknown; referrer?: unknown };
    const fromBody = typeof body.ref === "string" ? body.ref : typeof body.slug === "string" ? body.slug : null;
    rawRef = normalizeAffiliateRef(fromBody);
    referrer = typeof body.referrer === "string" ? body.referrer : null;
  } catch {
    /* body is optional — fall back to the cookie */
  }
  rawRef ??= affiliateRefSlugFromRequest(req);
  if (!rawRef) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  try {
    const affiliate = await getAffiliateByRef(rawRef);
    if (!affiliate || affiliate.status !== "active") {
      const res = NextResponse.json({ ok: true, tracked: false });
      res.cookies.set(AFFILIATE_REF_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    const campaign = campaignFromRef(rawRef, affiliate.slug);
    await recordAffiliateLinkHit({
      slug: affiliate.slug,
      campaign,
      ipHash: hashAffiliateVisitorIp(affiliateClientIp(req.headers)),
      referrerHost: affiliateReferrerHost(referrer),
    });
    if (campaign) await rememberAffiliateCampaign(affiliate.id, campaign);

    const user = await getSessionUser();
    if (user) {
      await attachAffiliateReferralToUser({ userId: user.id, email: user.email, slug: rawRef });
    }

    return NextResponse.json({ ok: true, tracked: true });
  } catch (err) {
    console.error("[affiliate/hit]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
