import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { listPdfUploads } from "@/lib/pdf-uploads";

export const runtime = "nodejs";

export async function GET() {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const items = await listPdfUploads(user.id);
        return NextResponse.json({ items });
    } catch (err) {
        console.error("[pdf-uploads GET]", err);
        return NextResponse.json(
            { error: "Failed to load your PDFs." },
            { status: 500 },
        );
    }
}
