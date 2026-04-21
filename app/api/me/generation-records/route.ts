import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { parseTool } from "@/lib/generations";
import { listGenerationRecords } from "@/lib/generation-records";

export async function GET(req: NextRequest) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const toolParam = searchParams.get("tool");
    const parsedTool = toolParam ? parseTool(toolParam) : undefined;
    if (toolParam && !parsedTool) {
        return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
    }

    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 100;

    try {
        const items = await listGenerationRecords(user.id, {
            tool: parsedTool ?? undefined,
            limit: Number.isFinite(limit) ? limit : 100,
        });
        return NextResponse.json({ items });
    } catch (err) {
        console.error("[me/generation-records GET]", err);
        return NextResponse.json(
            { error: "Failed to load generation history" },
            { status: 500 },
        );
    }
}
