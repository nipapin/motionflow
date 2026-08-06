import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import {
  normalizeDemoHost,
  publishGalToolkitDemoPointer,
} from "@/lib/galtoolkit-demo";
import { recordR2SyncEvent } from "@/lib/r2sync-events";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";
import { galtoolkitDemoZipKey } from "@/lib/galtoolkit-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** After client PUT to presigned URL — refresh latest.json. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: { host?: string; version?: string; name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const host = normalizeDemoHost(body.host);
  const version = (body.version || "").replace(/^v/i, "");
  if (!host || !version) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
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
      meta: { host, version, via: "studio" },
    }).catch(() => undefined);
    return NextResponse.json({ manifest });
  } catch (err) {
    console.error("[studio/packages/demo/publish]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
