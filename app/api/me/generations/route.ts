import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  consumeGeneration,
  getGenerationsStatus,
  parseTool,
} from "@/lib/generations";

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

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { tool?: unknown };
  const tool = parseTool(body.tool);
  if (!tool) {
    return NextResponse.json(
      { error: "Unknown tool" },
      { status: 400 },
    );
  }

  try {
    const result = await consumeGeneration(user.id, tool);
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            "You've reached your generation limit. Upgrade your plan to keep creating.",
          ...result.status,
        },
        { status: 402 },
      );
    }
    return NextResponse.json(result.status);
  } catch (err) {
    console.error("[me/generations POST]", err);
    return NextResponse.json(
      { error: "Failed to record generation" },
      { status: 500 },
    );
  }
}
