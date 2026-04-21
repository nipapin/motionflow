import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { deleteGenerationRecord } from "@/lib/generation-records";

export async function DELETE(
    _req: Request,
    context: { params: Promise<{ id: string }> },
) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    try {
        const deleted = await deleteGenerationRecord(user.id, id);
        if (!deleted) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[me/generation-records DELETE]", err);
        return NextResponse.json(
            { error: "Failed to delete record" },
            { status: 500 },
        );
    }
}
