import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/auth/resolve-request-user";
import { getGenerationsStatus } from "@/lib/generations";

/**
 * GET /api/me/generations
 * Cookie session or CEP Bearer (`mfcep_…`).
 */
export async function GET(req: NextRequest) {
  const user = await resolveRequestUser(req);
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const status = await getGenerationsStatus(user.id);
    return NextResponse.json({ authenticated: true, ...status });
  } catch (err) {
    console.error("[me/generations GET]", err);
    return NextResponse.json(
      { error: "Failed to load generation status" },
      { status: 500 },
    );
  }
}
