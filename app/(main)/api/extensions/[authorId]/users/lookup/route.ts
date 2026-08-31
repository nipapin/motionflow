import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import {
  getAuthorAccessSnapshot,
  lookupAuthorAccessByEmail,
  lookupUsersByEmailOrName,
} from "@/lib/admin-author-grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/extensions/[authorId]/users/lookup?q=&email=
 * Packages-admin: search users by email/name, or load access for one email.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const authorId = Number((await ctx.params).authorId);
  if (!Number.isFinite(authorId) || authorId <= 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!(await getPackagesAuthorById(authorId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const email = req.nextUrl.searchParams.get("email")?.trim() ?? "";
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  try {
    if (email) {
      const access = await lookupAuthorAccessByEmail({ authorId, email });
      return NextResponse.json({ access });
    }

    if (q.length < 3) {
      return NextResponse.json({ users: [] });
    }

    const users = await lookupUsersByEmailOrName({ q, limit: 10 });
    const withAccess = await Promise.all(
      users.map(async (u) => {
        const snap = await getAuthorAccessSnapshot({
          authorId,
          userId: u.id,
        });
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          subscription_active: snap?.subscription_active ?? false,
          subscription_label: snap?.subscription_label ?? null,
        };
      }),
    );
    return NextResponse.json({ users: withAccess });
  } catch (err) {
    console.error("[extensions/users/lookup GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
