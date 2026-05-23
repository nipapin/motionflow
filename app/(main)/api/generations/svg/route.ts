import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
    consumeGeneration,
    getGenerationsStatus,
} from "@/lib/generations";
import { GENERATION_LIMIT_REACHED_CODE } from "@/lib/ai-generation-gate";
import { requireCreatorAiForGeneration } from "@/lib/creator-ai-generation-access";
import { insertGenerationRecord } from "@/lib/generation-records";
import { mirrorReplicateUrlsToR2 } from "@/lib/replicate-mirror-output";
import {
    extractUrlsFromReplicateOutput,
    mapReplicateModelError,
} from "@/lib/replicate-image-model-io";

export const runtime = "nodejs";

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

const MODEL = "recraft-ai/recraft-20b-svg" as const;

const GENERIC_ERROR =
    "We couldn't generate the SVG right now. Please try again in a moment.";

/**
 * Recraft 20B SVG styles. The model groups them under two parents:
 *  - `vector_illustration/*` (rich vector art)
 *  - `icon/*`               (minimal icon styles)
 *
 * Keep this list in sync with `SVG_STYLE_PRESETS` in the client component.
 *
 * @see https://replicate.com/recraft-ai/recraft-20b-svg
 */
const ALLOWED_STYLES = new Set<string>([
    "vector_illustration",
    "vector_illustration/cartoon",
    "vector_illustration/doodle_line_art",
    "vector_illustration/engraving",
    "vector_illustration/flat_2",
    "vector_illustration/kawaii",
    "vector_illustration/line_art",
    "vector_illustration/line_circuit",
    "vector_illustration/linocut",
    "vector_illustration/seamless",
    "icon",
    "icon/broken_line",
    "icon/colored_outline",
    "icon/colored_shapes",
    "icon/colored_shapes_gradient",
    "icon/doodle_fill",
    "icon/doodle_offset_fill",
    "icon/offset_fill",
    "icon/outline",
    "icon/outline_gradient",
    "icon/uneven_fill",
]);

const ALLOWED_RATIOS = new Set([
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
]);

const RATIO_TO_SIZE: Record<string, string> = {
    "1:1": "1024x1024",
    "16:9": "1820x1024",
    "9:16": "1024x1820",
    "4:3": "1365x1024",
    "3:4": "1024x1365",
};

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to generate SVGs." },
                { status: 401 },
            );
        }

        const creatorAi = await requireCreatorAiForGeneration(user.id);
        if (!creatorAi.ok) {
            return creatorAi.response;
        }

        if (!process.env.REPLICATE_API_TOKEN) {
            console.error(
                "[svg generation] REPLICATE_API_TOKEN is not configured",
            );
            return NextResponse.json(
                {
                    error:
                        "SVG generation isn't available right now. Please try again later.",
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
        const style =
            typeof body.style === "string" && ALLOWED_STYLES.has(body.style)
                ? body.style
                : "vector_illustration";
        const aspect_ratio =
            typeof body.aspect_ratio === "string" &&
            ALLOWED_RATIOS.has(body.aspect_ratio)
                ? body.aspect_ratio
                : "1:1";

        if (!prompt) {
            return NextResponse.json(
                { error: "Please enter a prompt to generate an SVG." },
                { status: 400 },
            );
        }

        const preStatus = await getGenerationsStatus(user.id);
        if (preStatus.total_generations_left <= 0) {
            return NextResponse.json(
                {
                    code: GENERATION_LIMIT_REACHED_CODE,
                    ...preStatus,
                },
                { status: 402 },
            );
        }

        const size = RATIO_TO_SIZE[aspect_ratio] ?? "1024x1024";

        const input = {
            prompt,
            style,
            size,
        };

        let output: unknown;
        try {
            output = await replicate.run(MODEL, { input });
        } catch (err) {
            console.error("[svg generation] replicate error:", err);
            const { status, message } = mapReplicateModelError(err, GENERIC_ERROR);
            void insertGenerationRecord({
                userId: user.id,
                tool: "svg",
                status: "failed",
                settings: {
                    prompt,
                    style,
                    aspect_ratio,
                    size,
                    replicate_model: MODEL,
                },
                errorMessage: message,
            });
            return NextResponse.json({ error: message }, { status });
        }

        const deliveryUrls = extractUrlsFromReplicateOutput(output);

        if (!deliveryUrls.length) {
            console.error(
                "[svg generation] empty or unrecognized output:",
                output,
            );
            void insertGenerationRecord({
                userId: user.id,
                tool: "svg",
                status: "failed",
                settings: {
                    prompt,
                    style,
                    aspect_ratio,
                    size,
                    replicate_model: MODEL,
                },
                errorMessage: GENERIC_ERROR,
            });
            return NextResponse.json(
                { error: GENERIC_ERROR },
                { status: 502 },
            );
        }

        let persistedImages: string[];
        try {
            persistedImages = await mirrorReplicateUrlsToR2(deliveryUrls, {
                keyPrefix: `svg/${user.id}`,
                defaultContentType: "image/svg+xml",
            });
        } catch (mirrorErr) {
            console.error("[svg generation] mirror to R2 failed:", mirrorErr);
            const msg =
                mirrorErr instanceof Error
                    ? mirrorErr.message
                    : "Could not save the generated SVG. Please try again.";
            void insertGenerationRecord({
                userId: user.id,
                tool: "svg",
                status: "failed",
                settings: {
                    prompt,
                    style,
                    aspect_ratio,
                    size,
                    replicate_model: MODEL,
                },
                errorMessage: msg,
            });
            return NextResponse.json(
                { error: msg },
                { status: 502 },
            );
        }

        const consumed = await consumeGeneration(user.id, "svg");
        if (!consumed.ok) {
            return NextResponse.json(
                {
                    code: GENERATION_LIMIT_REACHED_CODE,
                    ...consumed.status,
                },
                { status: 402 },
            );
        }

        const recordId = await insertGenerationRecord({
            userId: user.id,
            tool: "svg",
            status: "ok",
            settings: {
                prompt,
                style,
                aspect_ratio,
                size,
                replicate_model: MODEL,
            },
            result: { images: persistedImages },
        });

        return NextResponse.json({
            images: persistedImages,
            prompt,
            style,
            aspect_ratio,
            generations: consumed.status,
            record_id: recordId > 0 ? String(recordId) : undefined,
        });
    } catch (error) {
        console.error("[svg generation] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
