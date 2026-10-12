import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { searchPackagesAuthorUsers } from "@/lib/packages-authors-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 3) return NextResponse.json({ users: [] });
  if (q.length > 254) return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  try {
    return NextResponse.json({ users: await searchPackagesAuthorUsers(q) });
  } catch (err) {
    console.error("[packages/authors/users GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Could not search users. Try again." }, { status: 500 });
  }
}
