import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  affiliateClientIp,
  affiliateRefSlugFromRequest,
  attachAffiliateReferralToUser,
  hashAffiliateVisitorIp,
  recordAffiliateLinkHit,
} from "@/lib/affiliate/attribution";
import { getAffiliateBySlug } from "@/lib/affiliate/db";
import { AFFILIATE_REF_COOKIE, normalizeAffiliateSlug } from "@/lib/affiliate/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public referral-link ping from `AffiliateRefTracker`. `proxy.ts` writes the
 * cookie without touching MySQL, so this is where the slug is actually verified:
 * unknown or deactivated partners get their cookie cleared instead of silently
 * shadowing a later valid referral.
 */
export async function POST(req: NextRequest) {
  let slug: string | null = null;
  try {
    const body = (await req.json()) as { slug?: unknown };
    slug = normalizeAffiliateSlug(typeof body.slug === "string" ? body.slug : null);
  } catch {
    /* body is optional — fall back to the cookie */
  }
  slug ??= affiliateRefSlugFromRequest(req);
  if (!slug) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  try {
    const affiliate = await getAffiliateBySlug(slug);
    if (!affiliate || affiliate.status !== "active") {
      const res = NextResponse.json({ ok: true, tracked: false });
      res.cookies.set(AFFILIATE_REF_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    await recordAffiliateLinkHit(
      slug,
      hashAffiliateVisitorIp(affiliateClientIp(req.headers)),
    );

    // Already-signed-in visitor following a partner link: stamp first touch now
    // rather than waiting for their next sign-in.
    const user = await getSessionUser();
    if (user) {
      await attachAffiliateReferralToUser({ userId: user.id, email: user.email, slug });
    }

    return NextResponse.json({ ok: true, tracked: true });
  } catch (err) {
    console.error("[affiliate/hit]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
