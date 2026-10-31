import { NextRequest, NextResponse } from "next/server";
import { resolveCepPermissionContext } from "@/lib/cep-author-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shared by all authors, including externally authenticated Odin accounts. */
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const context = await resolveCepPermissionContext(req.headers.get("authorization"));
    if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
    return NextResponse.json({ client: context.cfg.client, permissions: context.permissions }, { headers });
  } catch {
    console.error("[cep/permissions] permission lookup failed");
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500, headers });
  }
}
