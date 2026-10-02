import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { isAccountAuditCursor, listAccountAudit } from "@/lib/account-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session || !isAffiliateAdmin(session)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const id = Number((await params).id);
  const cursor = req.nextUrl.searchParams.get("cursor");
  if (!Number.isSafeInteger(id) || id <= 0 || (cursor !== null && !isAccountAuditCursor(cursor))) {
    return NextResponse.json({ error: "INVALID_HISTORY_PARAMS" }, { status: 400 });
  }
  try {
    // Retained history also remains readable by ID after account deletion.
    return NextResponse.json(await listAccountAudit(id, cursor ?? undefined), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("[admin/users/history]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
