import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { listExtensionUsersForAuthor } from "@/lib/cep-extension-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/extensions/[authorId]/users?q=&page=
 * Packages-admin only. Lists active CEP devices for the author's extension.
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

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const pageRaw = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  try {
    const result = await listExtensionUsersForAuthor({ authorId, q, page });
    if (!result) {
      return NextResponse.json(
        {
          error: "NO_CEP_CLIENT",
          message: "This author has no registered CEP extension client",
          users: [],
          total: 0,
          page: 1,
          page_size: 50,
        },
        { status: 200 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[extensions/users GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
