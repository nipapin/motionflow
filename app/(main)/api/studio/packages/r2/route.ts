import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  getPackagesAuthorBySlug,
  isPackagesAdmin,
} from "@/lib/packages-admin";
import { listR2ObjectsForAuthor } from "@/lib/r2-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const author = await getPackagesAuthorBySlug(req.nextUrl.searchParams.get("author"));
  if (!author) {
    return NextResponse.json({ error: "MISSING_AUTHOR" }, { status: 400 });
  }

  try {
    const objects = await listR2ObjectsForAuthor(
      author,
      req.nextUrl.searchParams.get("prefix"),
    );
    return NextResponse.json({ author, objects });
  } catch (err) {
    if (err instanceof Error && err.message === "BUCKET_NOT_CONFIGURED") {
      return NextResponse.json({ error: "BUCKET_NOT_CONFIGURED" }, { status: 400 });
    }
    console.error("[studio/packages/r2]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
