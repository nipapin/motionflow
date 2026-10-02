import { NextRequest, NextResponse } from "next/server";
import { GET as getUpdate } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve the authenticated client's release; never proxy an arbitrary URL. */
export async function GET(req: NextRequest) {
  const response = await getUpdate(req);
  if (!response.ok) return response;
  const manifest = await response.json() as { version?: string; zxpUrl?: string };
  if (!manifest.version || !manifest.zxpUrl) {
    return NextResponse.json({ error: "RELEASE_NOT_FOUND" }, { status: 404 });
  }
  if (req.nextUrl.searchParams.get("version") !== manifest.version) {
    return NextResponse.json({ error: "RELEASE_CHANGED", message: "Check for updates again." }, { status: 409 });
  }
  const url = new URL(manifest.zxpUrl);
  if (url.protocol !== "https:") return NextResponse.json({ error: "INVALID_RELEASE_URL" }, { status: 502 });
  return NextResponse.redirect(url, 302);
}
