import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { listR2AccountBuckets } from "@/lib/packages-r2-buckets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/packages/buckets — R2 buckets visible to the server credentials. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const buckets = await listR2AccountBuckets();
    return NextResponse.json({ buckets });
  } catch (err) {
    console.error("[packages/buckets GET]", err);
    return NextResponse.json(
      { error: "LIST_FAILED", message: "Could not list R2 buckets" },
      { status: 502 },
    );
  }
}
