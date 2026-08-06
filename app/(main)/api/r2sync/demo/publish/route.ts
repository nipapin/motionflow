import { NextRequest, NextResponse } from "next/server";
import { assertR2SyncAdmin } from "@/lib/packages-admin";
import {
  galtoolkitDemoZipKey,
  normalizeDemoHost,
  publishGalToolkitDemoPointer,
} from "@/lib/galtoolkit-demo";
import { recordR2SyncEvent } from "@/lib/r2sync-events";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";

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

  let body: { host?: string; version?: string; name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: CORS });
  }

  const host = normalizeDemoHost(body.host);
  const version = (body.version || "").replace(/^v/i, "");
  if (!host || !version) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400, headers: CORS });
  }

  try {
    const manifest = await publishGalToolkitDemoPointer({
      host,
      version,
      name: body.name,
      description: body.description,
    });
    await recordR2SyncEvent({
      authorId: PREMIERE_GAL_AUTHOR_ID,
      key: galtoolkitDemoZipKey(host, version),
      action: "demo.publish",
      meta: { host, version, via: "r2sync" },
    });
    return NextResponse.json({ manifest }, { headers: CORS });
  } catch (err) {
    console.error("[r2sync/demo/publish]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500, headers: CORS });
  }
}
