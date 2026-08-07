import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { listR2BucketForAuthor } from "@/lib/r2-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List one level of the author's R2 bucket (Delimiter=/). */
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
    const listing = await listR2BucketForAuthor(author, prefix);
    return NextResponse.json({
      author_id: authorId,
      bucket: author.r2Bucket,
      prefix: listing.prefix,
      folders: listing.folders,
      objects: listing.files,
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
