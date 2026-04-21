import { NextRequest, NextResponse } from "next/server";
import Replicate, { type FileOutput } from "replicate";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
    consumeGeneration,
    getGenerationsStatus,
} from "@/lib/generations";
import { requireCreatorAiForGeneration } from "@/lib/creator-ai-generation-access";
import { insertGenerationRecord } from "@/lib/generation-records";

export const runtime = "nodejs";
/** Allow long-running Replicate jobs. Adjust if your host caps lower. */
export const maxDuration = 300;

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/** See https://replicate.com/bytedance/seedance-1-pro-fast/api/schema */
const SEEDANCE_MODEL = "bytedance/seedance-1-pro-fast" as const;

const VIDEO_STYLE_HINTS: Record<string, string> = {
    cinematic:
        "cinematic film look, dramatic lighting, shallow depth of field, smooth camera movement, widescreen composition, film grain, color graded",
    anime:
        "anime style video, vibrant colors, clean linework, expressive motion, studio anime quality, dynamic poses",
    realistic:
        "photorealistic video, natural lighting, accurate physics, detailed textures, documentary camera style, stable exposure",
    artistic:
        "artistic experimental visuals, bold composition, creative color palette, expressive mood, fine-art motion aesthetic",
};

const ALLOWED_RATIOS = new Set(["16:9", "9:16", "1:1"]);
const ALLOWED_DURATIONS = new Set([5, 10]);
const ALLOWED_TARGET_RES = new Set(["720"]);

const FPS = 24;

const GENERIC_ERROR =
    "We couldn't generate the video right now. Please try again in a moment.";

function mapReplicateError(error: unknown): { status: number; message: string } {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const statusMatch = raw.match(/status\s+(\d{3})/i);
    const status = statusMatch ? Number(statusMatch[1]) : 500;

    if (status === 401 || status === 403) {
        return {
            status: 503,
            message:
                "The video service is temporarily unavailable. Please try again later.",
        };
    }

    if (status === 402 || /insufficient credit/i.test(raw)) {
        return {
            status: 503,
            message:
                "The video service is temporarily unavailable. Please try again later or contact support.",
        };
    }

    if (status === 429 || /rate.?limit/i.test(raw)) {
        return {
            status: 429,
            message:
                "Too many requests right now. Please wait a moment and try again.",
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
                "The video service is having issues right now. Please try again shortly.",
        };
    }

    return { status: 500, message: GENERIC_ERROR };
}

function extractMediaUrl(output: unknown): string | null {
    if (typeof output === "string" && /^https?:\/\//i.test(output)) {
        return output;
    }
    const items = Array.isArray(output) ? output : [output];
    for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const fo = item as FileOutput;
        if (typeof fo.url !== "function") continue;
        try {
            const u = fo.url();
            if (typeof u === "string") return u;
            if (u != null) return u.toString();
        } catch {
            /* ignore */
        }
    }
    return null;
}

function isHttpsUrl(value: string): boolean {
    try {
        const u = new URL(value);
        return u.protocol === "https:" || u.protocol === "http:";
    } catch {
        return false;
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to generate videos." },
                { status: 401 },
            );
        }

        const creatorAi = await requireCreatorAiForGeneration(user.id);
        if (!creatorAi.ok) {
            return creatorAi.response;
        }

        if (!process.env.REPLICATE_API_TOKEN) {
            console.error(
                "[video generation] REPLICATE_API_TOKEN is not configured",
            );
            return NextResponse.json(
                {
                    error:
                        "Video generation isn't available right now. Please try again later.",
                },
                { status: 503 },
            );
        }

        const body = (await req.json().catch(() => ({}))) as {
            prompt?: string;
            style?: string;
            aspect_ratio?: string;
            duration?: number;
            target_resolution?: string;
            first_frame_url?: string;
        };

        const prompt = body.prompt?.trim();
        const style = body.style ?? "realistic";
        const aspect_ratio = body.aspect_ratio ?? "16:9";
        const duration =
            typeof body.duration === "number" ? body.duration : 5;
        const target_resolution = body.target_resolution ?? "720";
        const first_frame_url = body.first_frame_url?.trim();

        if (!prompt) {
            return NextResponse.json(
                { error: "Please enter a prompt to generate a video." },
                { status: 400 },
            );
        }

        if (!ALLOWED_RATIOS.has(aspect_ratio)) {
            return NextResponse.json(
                { error: "Please choose a supported aspect ratio." },
                { status: 400 },
            );
        }

        if (!ALLOWED_DURATIONS.has(duration)) {
            return NextResponse.json(
                { error: "Please choose a supported duration (5 or 10 seconds)." },
                { status: 400 },
            );
        }

        if (!ALLOWED_TARGET_RES.has(target_resolution)) {
            return NextResponse.json(
                { error: "Output resolution must be 720p." },
                { status: 400 },
            );
        }

        if (
            first_frame_url !== undefined &&
            first_frame_url.length > 0 &&
            !isHttpsUrl(first_frame_url)
        ) {
            return NextResponse.json(
                { error: "First frame must be a valid http(s) image URL." },
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

        const styleHint = VIDEO_STYLE_HINTS[style] ?? VIDEO_STYLE_HINTS.cinematic;
        const finalPrompt = `${prompt}. Style: ${styleHint}.`;

        const resolution = "720p" as const;

        const seedInput: Record<string, string | number | boolean> = {
            prompt: finalPrompt,
            fps: FPS,
            duration,
            resolution,
            aspect_ratio,
            camera_fixed: false,
        };

        /** Replicate Seedance: optional image URL as motion reference / first frame. */
        if (first_frame_url) {
            seedInput.image = first_frame_url;
        }

        let seedOutput: unknown;
        try {
            seedOutput = await replicate.run(SEEDANCE_MODEL, {
                input: seedInput,
            });
        } catch (err) {
            console.error("[video generation] seedance error:", err);
            const { status, message } = mapReplicateError(err);
            void insertGenerationRecord({
                userId: user.id,
                tool: "video",
                status: "failed",
                settings: {
                    kind: "generate",
                    prompt,
                    style,
                    aspect_ratio,
                    duration,
                    target_resolution,
                    ...(first_frame_url
                        ? { first_frame_url: first_frame_url }
                        : {}),
                },
                errorMessage: message,
            });
            return NextResponse.json({ error: message }, { status });
        }

        const videoUrl = extractMediaUrl(seedOutput);
        if (!videoUrl) {
            console.error("[video generation] empty seedance output");
            void insertGenerationRecord({
                userId: user.id,
                tool: "video",
                status: "failed",
                settings: {
                    kind: "generate",
                    prompt,
                    style,
                    aspect_ratio,
                    duration,
                    target_resolution,
                    ...(first_frame_url
                        ? { first_frame_url: first_frame_url }
                        : {}),
                },
                errorMessage: GENERIC_ERROR,
            });
            return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
        }

        const consumed = await consumeGeneration(user.id, "video");
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

        const recordId = await insertGenerationRecord({
            userId: user.id,
            tool: "video",
            status: "ok",
            settings: {
                kind: "generate",
                prompt,
                style,
                aspect_ratio,
                duration,
                target_resolution,
                ...(first_frame_url
                    ? { first_frame_url: first_frame_url }
                    : {}),
            },
            result: { video: videoUrl },
        });

        return NextResponse.json({
            video: videoUrl,
            prompt,
            style,
            aspect_ratio,
            duration,
            target_resolution,
            generations: consumed.status,
            record_id: recordId > 0 ? String(recordId) : undefined,
        });
    } catch (error) {
        console.error("[video generation] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
