import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { getExtensionUserPacks } from "@/lib/cep-extension-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/extensions/[authorId]/users/[userId]/packs
 * Packages-admin: purchased / installed / active packs for one user.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ authorId: string; userId: string }> },
) {
  const session = await getSessionUser();
  if (!session || !isPackagesAdmin(session.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { authorId: authorRaw, userId: userRaw } = await ctx.params;
  const authorId = Number(authorRaw);
  const userId = Number(userRaw);
  if (
    !Number.isFinite(authorId) ||
    authorId <= 0 ||
    !Number.isFinite(userId) ||
    userId <= 0
  ) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!(await getPackagesAuthorById(authorId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const result = await getExtensionUserPacks({ authorId, userId });
    if (!result) {
      return NextResponse.json(
        { error: "NO_CEP_CLIENT", message: "No CEP client or user not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[extensions/users/packs GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
