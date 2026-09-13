import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { getAffiliateById, updateAffiliate } from "@/lib/affiliate/db";
import { affiliateUpdateSchema } from "@/lib/validations/affiliate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edit percent / recurring mode / social / name, or deactivate. The slug is
 * immutable on purpose — links already printed in a partner's bio must not break.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!isAffiliateAdmin(user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = affiliateUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const existing = await getAffiliateById(id);
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const affiliate = await updateAffiliate(id, parsed.data);
    return NextResponse.json({ ok: true, affiliate });
  } catch (err) {
    console.error("[partners PATCH]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
