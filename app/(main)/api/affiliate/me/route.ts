import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getAffiliateForUser } from "@/lib/affiliate/db";
import { affiliateRefLink } from "@/lib/affiliate/shared";
import { affiliatePeriodStats, resolveAffiliatePeriod } from "@/lib/affiliate/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in partner's own summary (used by the CEP/extension and clients). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const affiliate = await getAffiliateForUser(user);
    if (!affiliate) {
      return NextResponse.json({ affiliate: null });
    }
    const params = req.nextUrl.searchParams;
    const period = resolveAffiliatePeriod(
      params.get("date"),
      params.get("from"),
      params.get("to"),
    );
    const stats = await affiliatePeriodStats(affiliate, period);
    return NextResponse.json({
      affiliate: {
        id: affiliate.id,
        name: affiliate.name,
        slug: affiliate.slug,
        status: affiliate.status,
        commissionPercent: affiliate.commissionPercent,
        recurringMode: affiliate.recurringMode,
        payoneerEmail: affiliate.payoneerEmail,
        refLink: affiliateRefLink(affiliate.slug),
      },
      period,
      stats,
    });
  } catch (err) {
    console.error("[affiliate/me GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
