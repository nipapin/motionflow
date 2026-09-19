import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { searchAdminMarketItems } from "@/lib/admin-user-grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!isAffiliateAdmin(user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const items = await searchAdminMarketItems(q);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("[admin/users/items GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
