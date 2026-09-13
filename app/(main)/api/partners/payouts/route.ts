import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import {
  listDuePayouts,
  listPayoutHistory,
  markAffiliatePayoutPaid,
  utcMonthPeriod,
} from "@/lib/affiliate/payouts";
import { affiliatePayoutMarkPaidSchema } from "@/lib/validations/affiliate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!isAffiliateAdmin(user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  try {
    const [due, history] = await Promise.all([listDuePayouts(), listPayoutHistory()]);
    return NextResponse.json({ due, history });
  } catch (err) {
    console.error("[partners/payouts GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

/** Mark one partner's month as paid (manual Payoneer transfer, no automation). */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isAffiliateAdmin(user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = affiliatePayoutMarkPaidSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [year, month] = parsed.data.periodStart.split("-").map(Number);
  const period = utcMonthPeriod(year, month - 1);
  if (period.start !== parsed.data.periodStart) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  try {
    const result = await markAffiliatePayoutPaid({
      affiliateId: parsed.data.affiliateId,
      period,
      adminUserId: user.id,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          message:
            result.error === "ALREADY_PAID"
              ? `${period.label} is already marked as paid for this partner.`
              : `Nothing due for ${period.label}.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, payoutId: result.payoutId, amount: result.amount });
  } catch (err) {
    console.error("[partners/payouts POST]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
