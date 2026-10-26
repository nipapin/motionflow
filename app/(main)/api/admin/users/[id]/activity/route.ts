import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { decodeActivityCursor, listUserActivity } from "@/lib/user-activity-reader";
import { ACTIVITY_CATEGORIES, type ActivityCategory } from "@/lib/user-activity-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser();
  if (!session || !isAffiliateAdmin(session)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const userId = Number((await params).id);
  const rawCursor = req.nextUrl.searchParams.get("cursor");
  const category = req.nextUrl.searchParams.get("category");
  const cursor = rawCursor === null ? undefined : decodeActivityCursor(rawCursor);
  if (!Number.isSafeInteger(userId) || userId <= 0 || cursor === null ||
    (category !== null && !ACTIVITY_CATEGORIES.includes(category as ActivityCategory))) {
    return NextResponse.json({ error: "INVALID_ACTIVITY_PARAMS" }, { status: 400 });
  }
  try {
    return NextResponse.json(await listUserActivity(userId, { cursor, category: category === null ? undefined : category as ActivityCategory }),
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[admin/users/activity]", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
