import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { getSessionUser } from "@/lib/auth/get-session-user";

export const runtime = "nodejs";

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Stream a Replicate-hosted file with server-side auth so `<img src>` works.
 */
export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ fileId: string }> },
) {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
        return NextResponse.json(
            { error: "Image service not configured" },
            { status: 503 },
        );
    }

    const { fileId: rawId } = await context.params;
    const fileId = decodeURIComponent(rawId ?? "").trim();
    if (!fileId || fileId.length > 512) {
        return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
    }

    try {
        const meta = await replicate.files.get(fileId);
        const downloadUrl = meta.urls?.get;
        if (typeof downloadUrl !== "string" || !downloadUrl) {
            return NextResponse.json({ error: "File not found" }, { status: 404 });
        }

        const upstream = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!upstream.ok) {
            const text = await upstream.text().catch(() => "");
            console.error(
                "[replicate-files] upstream",
                upstream.status,
                text.slice(0, 200),
            );
            return NextResponse.json(
                { error: "Could not load file" },
                { status: upstream.status >= 400 ? upstream.status : 502 },
            );
        }

        const contentType =
            upstream.headers.get("content-type") || "application/octet-stream";
        const buf = Buffer.from(await upstream.arrayBuffer());

        return new NextResponse(buf, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "private, max-age=3600",
            },
        });
    } catch (e) {
        console.error("[replicate-files] GET", e);
        return NextResponse.json(
            { error: "Failed to load file" },
            { status: 500 },
        );
    }
}
