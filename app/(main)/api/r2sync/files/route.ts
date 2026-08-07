import { NextRequest, NextResponse } from "next/server";
import {
  assertR2SyncAdmin,
  getPackagesAuthorBySlug,
} from "@/lib/packages-admin";
import { listR2ObjectsForAuthor } from "@/lib/r2-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-r2sync-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const gate = assertR2SyncAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status, headers: CORS });
  }

  const author = await getPackagesAuthorBySlug(req.nextUrl.searchParams.get("author"));
  if (!author) {
    return NextResponse.json({ error: "MISSING_AUTHOR" }, { status: 400, headers: CORS });
  }

  try {
    const objects = await listR2ObjectsForAuthor(
      author,
      req.nextUrl.searchParams.get("prefix"),
    );
    return NextResponse.json({ author, objects }, { headers: CORS });
  } catch (err) {
    if (err instanceof Error && err.message === "BUCKET_NOT_CONFIGURED") {
      return NextResponse.json({ error: "BUCKET_NOT_CONFIGURED" }, { status: 400, headers: CORS });
    }
    console.error("[r2sync/files]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500, headers: CORS });
  }
}
