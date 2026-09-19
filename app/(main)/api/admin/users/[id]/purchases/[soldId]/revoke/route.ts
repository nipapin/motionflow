import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import {
  AdminUserGrantError,
  restoreAdminUserPurchase,
  revokeAdminUserPurchase,
} from "@/lib/admin-user-grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; soldId: string }> },
) {
  const session = await getSessionUser();
  if (!isAffiliateAdmin(session)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id: rawId, soldId: rawSoldId } = await params;
  const userId = Number(rawId);
  const soldId = Number(rawSoldId);
  if (
    !Number.isInteger(userId) ||
    userId <= 0 ||
    !Number.isInteger(soldId) ||
    soldId <= 0
  ) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  let restore = false;
  try {
    const json = (await req.json().catch(() => null)) as { restore?: unknown } | null;
    restore = json?.restore === true;
  } catch {
    restore = false;
  }

  try {
    if (restore) {
      const result = await restoreAdminUserPurchase({ userId, soldId });
      return NextResponse.json({ ok: true, ...result });
    }
    const result = await revokeAdminUserPurchase({ userId, soldId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AdminUserGrantError && err.code === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[admin/users purchases revoke]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
