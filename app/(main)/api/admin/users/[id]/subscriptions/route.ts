import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { getAdminUserById } from "@/lib/admin-users";
import { grantAdminUserSubscription } from "@/lib/admin-user-grants";
import { adminUserGrantSubscriptionSchema } from "@/lib/validations/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!isAffiliateAdmin(session)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = adminUserGrantSubscriptionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const existing = await getAdminUserById(userId);
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const result = await grantAdminUserSubscription({
      userId,
      grant: parsed.data,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[admin/users subscriptions POST]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
