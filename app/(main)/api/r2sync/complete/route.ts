import { NextRequest, NextResponse } from "next/server";
import {
  assertR2SyncAdmin,
  getPackagesAuthorBySlug,
  isKeyAllowedForAuthor,
} from "@/lib/packages-admin";
import { recordR2SyncEvent } from "@/lib/r2sync-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-r2sync-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const gate = assertR2SyncAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status, headers: CORS });
  }

  let body: {
    author?: string;
    key?: string;
    action?: string;
    meta?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: CORS });
  }

  const author = getPackagesAuthorBySlug(body.author);
  const key = (body.key || "").replace(/^\/+/, "");
  if (!author || !key) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400, headers: CORS });
  }
  if (!isKeyAllowedForAuthor(author, key)) {
    return NextResponse.json({ error: "KEY_NOT_ALLOWED" }, { status: 403, headers: CORS });
  }

  await recordR2SyncEvent({
    authorId: author.id,
    key,
    action: body.action || "upload.complete",
    meta: body.meta ?? null,
  });

  return NextResponse.json({ ok: true }, { headers: CORS });
}
