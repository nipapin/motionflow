import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { createAffiliate, listAffiliates } from "@/lib/affiliate/db";
import { sendAffiliatePartnerInvite } from "@/lib/affiliate/invite";
import { affiliateRefLink } from "@/lib/affiliate/shared";
import { affiliateCreateSchema } from "@/lib/validations/affiliate";
import { mailSiteOriginFromHeaders } from "@/lib/mail/public-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!isAffiliateAdmin(user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  try {
    const affiliates = await listAffiliates();
    return NextResponse.json({ affiliates });
  } catch (err) {
    console.error("[partners GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!isAffiliateAdmin(user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = affiliateCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const created = await createAffiliate(parsed.data);
    if (!created.ok) {
      return NextResponse.json(
        {
          error: created.error,
          message:
            created.error === "SLUG_TAKEN"
              ? "That referral slug is already taken."
              : "A partner with this email already exists.",
        },
        { status: 409 },
      );
    }

    // Existing accounts skip the invite; the Affiliate tab appears on their next
    // visit because the partner row is linked by email.
    let invited = false;
    try {
      const invite = await sendAffiliatePartnerInvite({
        affiliate: created.affiliate,
        siteOrigin: mailSiteOriginFromHeaders(req.headers),
      });
      invited = invite.sent;
    } catch (inviteErr) {
      console.error("[partners POST] invite send", inviteErr);
    }

    return NextResponse.json(
      {
        ok: true,
        affiliate: created.affiliate,
        refLink: affiliateRefLink(created.affiliate.slug),
        invited,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[partners POST]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
