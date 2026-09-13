import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getAffiliateForUser, setAffiliatePayoneerEmail } from "@/lib/affiliate/db";
import { affiliatePayoneerSchema } from "@/lib/validations/affiliate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Partners set their own payout address; admins only read it. */
export async function PATCH(req: NextRequest) {
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

  const parsed = affiliatePayoneerSchema.safeParse(json);
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
    await setAffiliatePayoneerEmail(affiliate.id, parsed.data.payoneerEmail);
    return NextResponse.json({ ok: true, payoneerEmail: parsed.data.payoneerEmail });
  } catch (err) {
    console.error("[affiliate/payoneer PATCH]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
