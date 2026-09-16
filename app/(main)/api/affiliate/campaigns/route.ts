import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { createAffiliateCampaign, getAffiliateForUser } from "@/lib/affiliate/db";
import { affiliateRefLink } from "@/lib/affiliate/shared";
import { affiliateCampaignCreateSchema } from "@/lib/validations/affiliate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = affiliateCampaignCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const affiliate = await getAffiliateForUser(user);
    if (!affiliate) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const created = await createAffiliateCampaign(affiliate.id, parsed.data.code);
    if (!created.ok) {
      return NextResponse.json(
        {
          error: created.error,
          message:
            created.error === "TAKEN"
              ? "You already have a link with this name."
              : "Use lowercase letters, digits and dashes.",
        },
        { status: created.error === "TAKEN" ? 409 : 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      campaign: created.campaign,
      refLink: affiliateRefLink(affiliate.slug, created.campaign.code),
    });
  } catch (err) {
    console.error("[affiliate/campaigns POST]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
