import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getGenerationsStatus } from "@/lib/generations";

export async function GET() {
  const user = await getSessionUser();
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
