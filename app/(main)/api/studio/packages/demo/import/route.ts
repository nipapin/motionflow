import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { normalizeDemoHost } from "@/lib/galtoolkit-demo";
import { importGalToolkitDemoFromPremieregal } from "@/lib/premieregal-demo-import";
import { recordR2SyncEvent } from "@/lib/r2sync-events";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Large R2 CopyObject (MAX zips) may need more than the default. */
export const maxDuration = 300;

/**
 * Copy a zip from the legacy `premieregal` bucket into
 * `public/downloads/galtoolkit/demo/{PR|AE}/{version}/pack.zip` and refresh latest.json.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: {
    host?: string;
    sourceKey?: string;
    version?: string;
    name?: string;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const host = normalizeDemoHost(body.host);
  const sourceKey = (body.sourceKey || "").trim();
  if (!host || !sourceKey) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  try {
    const result = await importGalToolkitDemoFromPremieregal({
      host,
      sourceKey,
      version: body.version,
      name: body.name,
      description: body.description,
    });
    await recordR2SyncEvent({
      authorId: PREMIERE_GAL_AUTHOR_ID,
      key: result.destKey,
      action: "demo.import",
      meta: {
        host,
        version: result.manifest.version,
        sourceKey,
        bytes: result.bytes,
        via: "studio",
      },
    }).catch(() => undefined);
    return NextResponse.json(result);
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    console.error("[studio/packages/demo/import]", err);
    if (status === 404) {
      return NextResponse.json({ error: "SOURCE_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
