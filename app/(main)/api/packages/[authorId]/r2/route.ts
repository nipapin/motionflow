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
  const author = await getPackagesAuthorById(authorId);
  if (!author) return NextResponse.json({ error: "UNKNOWN_AUTHOR" }, { status: 404 });

  const prefix = req.nextUrl.searchParams.get("prefix");
  try {
    const objects = await listR2ObjectsForAuthor(author, prefix);
    return NextResponse.json({
      author_id: authorId,
      bucket: author.r2Bucket,
      objects,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "BUCKET_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "BUCKET_NOT_CONFIGURED", message: "Set the author R2 bucket first" },
        { status: 400 },
      );
    }
    console.error("[packages/r2]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
