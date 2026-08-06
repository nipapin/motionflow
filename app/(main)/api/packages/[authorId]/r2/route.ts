import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { listR2ObjectsForAuthor } from "@/lib/r2-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List R2 objects under the author's allowed prefixes (for bind-existing picker). */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const authorId = Number((await ctx.params).authorId);
  const author = getPackagesAuthorById(authorId);
  if (!author) return NextResponse.json({ error: "UNKNOWN_AUTHOR" }, { status: 404 });

  const prefix = req.nextUrl.searchParams.get("prefix");
  try {
    const objects = await listR2ObjectsForAuthor(author, prefix);
    return NextResponse.json({ author_id: authorId, objects });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "PREFIX_NOT_ALLOWED") {
      return NextResponse.json({ error: "PREFIX_NOT_ALLOWED" }, { status: 403 });
    }
    console.error("[packages/r2]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
