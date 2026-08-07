import { NextRequest, NextResponse } from "next/server";
import {
  assertR2SyncAdmin,
  getPackagesAuthorBySlug,
} from "@/lib/packages-admin";
import { listR2SyncEvents } from "@/lib/r2sync-events";

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

  const authorSlug = req.nextUrl.searchParams.get("author");
  const author = authorSlug ? await getPackagesAuthorBySlug(authorSlug) : null;
  if (authorSlug && !author) {
    return NextResponse.json({ error: "MISSING_AUTHOR" }, { status: 400, headers: CORS });
  }

  const events = await listR2SyncEvents({
    authorId: author?.id,
    limit: Number(req.nextUrl.searchParams.get("limit") || 50),
  });
  return NextResponse.json({ events }, { headers: CORS });
}
