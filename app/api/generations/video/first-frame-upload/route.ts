import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { requireCreatorAiForGeneration } from "@/lib/creator-ai-generation-access";
import { uploadBufferToR2 } from "@/lib/r2-storage";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to upload images." },
                { status: 401 },
            );
        }

        const creatorAi = await requireCreatorAiForGeneration(user.id);
        if (!creatorAi.ok) {
            return creatorAi.response;
        }

        const form = await req.formData();
        const file = form.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "Expected a file field named \"file\"." },
                { status: 400 },
            );
        }

        if (file.size <= 0 || file.size > MAX_BYTES) {
            return NextResponse.json(
                { error: "Image must be under 15 MB." },
                { status: 400 },
            );
        }

        const type = file.type || "application/octet-stream";
        if (!ALLOWED_TYPES.has(type)) {
            return NextResponse.json(
                { error: "Please upload a JPEG, PNG, WebP, or GIF image." },
                { status: 400 },
            );
        }

        const buf = Buffer.from(await file.arrayBuffer());

        let url: string;
        try {
            const result = await uploadBufferToR2(buf, {
                contentType: type,
                keyPrefix: `first-frame/${user.id}`,
            });
            url = result.url;
        } catch (err) {
            console.error("[first-frame-upload] R2 upload failed:", err);
            return NextResponse.json(
                { error: "Could not store the image. Please try again." },
                { status: 502 },
            );
        }

        return NextResponse.json({ url });
    } catch (error) {
        console.error("[first-frame-upload] unexpected error:", error);
        return NextResponse.json(
            { error: "Upload failed. Please try again." },
            { status: 500 },
        );
    }
}
