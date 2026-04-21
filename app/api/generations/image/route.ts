import { NextRequest, NextResponse } from "next/server";
import Replicate, { type FileOutput } from "replicate";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
    consumeGeneration,
    getGenerationsStatus,
} from "@/lib/generations";

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

const STYLE_HINTS: Record<string, string> = {
    realistic:
        "ultra realistic photograph, photorealistic, sharp focus, natural lighting, high detail, 8k",
    anime: "anime style, vibrant colors, cel shading, studio quality illustration",
    "3d": "3d render, octane render, cinema 4d, ray tracing, ultra detailed, volumetric lighting",
    "digital-art":
        "digital art, concept art, trending on artstation, highly detailed, vivid colors",
    "oil-painting":
        "oil painting, thick brush strokes, classical art, museum quality, rich textures",
    watercolor:
        "watercolor painting, soft washes, delicate brushwork, paper texture, pastel colors",
};

const ALLOWED_RATIOS = new Set([
    "1:1",
    "16:9",
    "9:16",
]);

const GENERIC_ERROR =
    "We couldn't generate the image right now. Please try again in a moment.";

function mapReplicateError(error: unknown): { status: number; message: string } {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const statusMatch = raw.match(/status\s+(\d{3})/i);
    const status = statusMatch ? Number(statusMatch[1]) : 500;

    if (status === 401 || status === 403) {
        return {
            status: 503,
            message:
                "The image service is temporarily unavailable. Please try again later.",
        };
    }

    if (status === 402 || /insufficient credit/i.test(raw)) {
        return {
            status: 503,
            message:
                "The image service is temporarily unavailable. Please try again later or contact support.",
        };
    }

    if (status === 429 || /rate.?limit/i.test(raw)) {
        return {
            status: 429,
            message: "Too many requests right now. Please wait a moment and try again.",
        };
    }

    if (status === 422 || /nsfw|safety|sensitive/i.test(raw)) {
        return {
            status: 400,
            message:
                "Your prompt couldn't be processed. Please rephrase it and try again.",
        };
    }

    if (status >= 500 && status < 600) {
        return {
            status: 503,
            message:
                "The image service is having issues right now. Please try again shortly.",
        };
    }

    return { status: 500, message: GENERIC_ERROR };
}

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to generate images." },
                { status: 401 },
            );
        }

        if (!process.env.REPLICATE_API_TOKEN) {
            console.error(
                "[image generation] REPLICATE_API_TOKEN is not configured",
            );
            return NextResponse.json(
                {
                    error:
                        "Image generation isn't available right now. Please try again later.",
                },
                { status: 503 },
            );
        }

        const body = (await req.json().catch(() => ({}))) as {
            prompt?: string;
            style?: string;
            aspect_ratio?: string;
        };

        const prompt = body.prompt?.trim();
        const style = body.style ?? "realistic";
        const aspect_ratio = body.aspect_ratio ?? "1:1";

        if (!prompt) {
            return NextResponse.json(
                { error: "Please enter a prompt to generate an image." },
                { status: 400 },
            );
        }

        if (!ALLOWED_RATIOS.has(aspect_ratio)) {
            return NextResponse.json(
                { error: "Please choose a supported aspect ratio." },
                { status: 400 },
            );
        }

        const preStatus = await getGenerationsStatus(user.id);
        if (preStatus.remaining <= 0) {
            return NextResponse.json(
                {
                    error:
                        "You've reached your generation limit. Upgrade your plan to keep creating.",
                    ...preStatus,
                },
                { status: 402 },
            );
        }

        const styleHint = STYLE_HINTS[style] ?? STYLE_HINTS.realistic;
        const finalPrompt = `${prompt}. Style: ${styleHint}.`;

        const input = {
            prompt: finalPrompt,
            aspect_ratio,
        };

        let output: FileOutput[] | FileOutput;
        try {
            output = (await replicate.run("bytedance/seedream-5-lite", {
                input,
            })) as FileOutput[] | FileOutput;
        } catch (err) {
            console.error("[image generation] replicate error:", err);
            const { status, message } = mapReplicateError(err);
            return NextResponse.json({ error: message }, { status });
        }

        const items = Array.isArray(output) ? output : [output];

        if (!items.length) {
            console.error("[image generation] empty output from replicate");
            return NextResponse.json(
                { error: GENERIC_ERROR },
                { status: 502 },
            );
        }

        const images = items
            .map((item) => {
                try {
                    const url = item?.url?.();
                    return typeof url === "string" ? url : url?.toString() ?? null;
                } catch {
                    return null;
                }
            })
            .filter((url): url is string => Boolean(url));

        if (!images.length) {
            console.error("[image generation] no image urls in output");
            return NextResponse.json(
                { error: GENERIC_ERROR },
                { status: 502 },
            );
        }

        const consumed = await consumeGeneration(user.id, "image");
        if (!consumed.ok) {
            return NextResponse.json(
                {
                    error:
                        "You've reached your generation limit. Upgrade your plan to keep creating.",
                    ...consumed.status,
                },
                { status: 402 },
            );
        }

        return NextResponse.json({
            images,
            prompt,
            style,
            aspect_ratio,
            generations: consumed.status,
        });
    } catch (error) {
        console.error("[image generation] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
