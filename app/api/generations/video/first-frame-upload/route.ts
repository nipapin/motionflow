import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { requireCreatorAiForGeneration } from "@/lib/creator-ai-generation-access";

export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

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

        if (!process.env.REPLICATE_API_TOKEN) {
            return NextResponse.json(
                {
                    error:
                        "Upload isn't available right now. Please try again later.",
                },
                { status: 503 },
            );
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

        const created = await replicate.files.create(file);

        const url = created.urls?.get;
        if (!url || typeof url !== "string") {
            console.error(
                "[first-frame-upload] missing urls.get in response",
                created,
            );
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
