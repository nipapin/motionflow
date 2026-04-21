import { NextRequest, NextResponse } from "next/server";
import Replicate, { type FileOutput } from "replicate";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
    consumeGeneration,
    getGenerationsStatus,
} from "@/lib/generations";
import { insertGenerationRecord } from "@/lib/generation-records";

export const runtime = "nodejs";
export const maxDuration = 300;

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/** https://replicate.com/xai/grok-imagine-video-extension */
const GROK_EXTEND_MODEL = "xai/grok-imagine-video-extension" as const;

const GENERIC_ERROR =
    "We couldn't extend the video right now. Please try again in a moment.";

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

/** Extension clip length (seconds); aligned with product (3 or 5 only). */
const ALLOWED_EXT_DURATIONS = new Set([3, 5]);

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to extend videos." },
                { status: 401 },
            );
        }

        if (!process.env.REPLICATE_API_TOKEN) {
            console.error(
                "[video extend] REPLICATE_API_TOKEN is not configured",
            );
            return NextResponse.json(
                {
                    error:
                        "Video extension isn't available right now. Please try again later.",
                },
                { status: 503 },
            );
        }

        const body = (await req.json().catch(() => ({}))) as {
            video?: string;
            prompt?: string;
            duration?: number;
        };

        const video = body.video?.trim();
        const prompt = body.prompt?.trim();
        const duration =
            typeof body.duration === "number" ? body.duration : 5;

        if (!video || !/^https?:\/\//i.test(video)) {
            return NextResponse.json(
                { error: "A valid source video URL is required." },
                { status: 400 },
            );
        }

        if (!prompt) {
            return NextResponse.json(
                { error: "Describe what should happen next in the extension." },
                { status: 400 },
            );
        }

        if (!Number.isInteger(duration) || !ALLOWED_EXT_DURATIONS.has(duration)) {
            return NextResponse.json(
                {
                    error: "Extension duration must be 3 or 5 seconds.",
                },
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

        let output: unknown;
        try {
            output = await replicate.run(GROK_EXTEND_MODEL, {
                input: {
                    video,
                    prompt,
                    duration,
                },
            });
        } catch (err) {
            console.error("[video extend] replicate error:", err);
            const { status, message } = mapReplicateError(err);
            void insertGenerationRecord({
                userId: user.id,
                tool: "video",
                status: "failed",
                settings: {
                    kind: "extend",
                    prompt,
                    extend_duration: duration,
                    source_video_url: video,
                },
                errorMessage: message,
            });
            return NextResponse.json({ error: message }, { status });
        }

        const videoUrl = extractMediaUrl(output);
        if (!videoUrl) {
            console.error("[video extend] empty output from replicate");
            void insertGenerationRecord({
                userId: user.id,
                tool: "video",
                status: "failed",
                settings: {
                    kind: "extend",
                    prompt,
                    extend_duration: duration,
                    source_video_url: video,
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
                kind: "extend",
                prompt,
                extend_duration: duration,
                source_video_url: video,
            },
            result: { video: videoUrl },
        });

        return NextResponse.json({
            video: videoUrl,
            prompt,
            duration,
            generations: consumed.status,
            record_id: recordId > 0 ? String(recordId) : undefined,
        });
    } catch (error) {
        console.error("[video extend] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
