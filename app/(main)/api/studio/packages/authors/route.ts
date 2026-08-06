import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin, PACKAGES_AUTHORS } from "@/lib/packages-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return NextResponse.json({ authors: PACKAGES_AUTHORS });
}
