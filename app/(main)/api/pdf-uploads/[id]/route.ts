import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { deletePdfUpload } from "@/lib/pdf-uploads";
import { deleteR2Object } from "@/lib/r2-storage";

export const runtime = "nodejs";

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
        const key = await deletePdfUpload(user.id, id);
        if (!key) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        try {
            await deleteR2Object(key);
        } catch (err) {
            console.error("[pdf-uploads DELETE] R2 delete failed:", err);
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("[pdf-uploads DELETE]", err);
        return NextResponse.json(
            { error: "Failed to delete the PDF." },
            { status: 500 },
        );
    }
}
