import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { listDistinctAuthorBuckets } from "@/lib/packages-authors-db";
import { listAvailablePackagesBuckets } from "@/lib/packages-r2-buckets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const fromEnv = listAvailablePackagesBuckets();
    const fromDb = await listDistinctAuthorBuckets();
    const seen = new Set(fromEnv);
    const buckets = [...fromEnv];
    for (const b of fromDb) {
      if (!seen.has(b)) {
        seen.add(b);
        buckets.push(b);
      }
    }
    return NextResponse.json({ buckets });
  } catch (err) {
    console.error("[packages/buckets GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
