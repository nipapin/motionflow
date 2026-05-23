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
    isAllowedSourceImageUrl,
    mapReplicateModelError,
    normalizeImageUrlForReplicate,
} from "@/lib/replicate-image-model-io";

export const runtime = "nodejs";

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

const MODEL = "prunaai/p-image-upscale" as const;

const GENERIC_ERROR =
    "We couldn't upscale the image right now. Please try again in a moment.";

const ALLOWED_FACTORS = new Set([2, 4, 8]);

const OUTPUT_QUALITY = 80;

const ALLOWED_INPUT_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

function mimeToOutputFormat(mime: string): "jpg" | "png" | "webp" {
    const m = mime.toLowerCase().split(";")[0].trim();
    if (m === "image/png") return "png";
    if (m === "image/webp") return "webp";
    return "jpg";
}

function inferFormatFromImageUrl(url: string): "jpg" | "png" | "webp" {
    const noQuery = url.split("?")[0].toLowerCase();
    if (noQuery.endsWith(".png")) return "png";
    if (noQuery.endsWith(".webp")) return "webp";
    if (noQuery.endsWith(".jpg") || noQuery.endsWith(".jpeg")) return "jpg";
    return "jpg";
}

function formatKeyToMime(fmt: "jpg" | "png" | "webp"): string {
    if (fmt === "png") return "image/png";
    if (fmt === "webp") return "image/webp";
    return "image/jpeg";
}

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to use this tool." },
                { status: 401 },
            );
        }

        const creatorAi = await requireCreatorAiForGeneration(user.id);
        if (!creatorAi.ok) {
            return creatorAi.response;
        }

        if (!process.env.REPLICATE_API_TOKEN) {
            console.error(
                "[image-upscale] REPLICATE_API_TOKEN is not configured",
            );
            return NextResponse.json(
                {
                    error:
                        "This tool isn't available right now. Please try again later.",
                },
                { status: 503 },
            );
        }

        const body = (await req.json().catch(() => ({}))) as {
            image?: string;
            factor?: unknown;
            /** Client upload MIME: image/jpeg | image/png | image/webp */
            source_content_type?: string;
        };

        const raw = body.image?.trim();
        if (!raw) {
            return NextResponse.json(
                { error: "Please upload an image to upscale." },
                { status: 400 },
            );
        }

        if (!isAllowedSourceImageUrl(raw)) {
            return NextResponse.json(
                { error: "This image URL is not allowed." },
                { status: 400 },
            );
        }

        const factorRaw = Number(body.factor);
        const factor = ALLOWED_FACTORS.has(factorRaw) ? factorRaw : 2;

        const enhance_realism = true;
        const enhance_details = true;

        const rawMime =
            typeof body.source_content_type === "string"
                ? body.source_content_type.trim()
                : "";
        const srcMime =
            rawMime && ALLOWED_INPUT_MIMES.has(rawMime) ? rawMime : "";
        const output_format = srcMime
            ? mimeToOutputFormat(srcMime)
            : inferFormatFromImageUrl(raw);

        const storedSourceMime =
            srcMime !== "" ? srcMime : formatKeyToMime(output_format);

        const upscale_mode = "factor" as const;
        const target = 4;

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

        const imageForReplicate = normalizeImageUrlForReplicate(raw);

        const summaryPrompt = `Upscale ${factor}×`;

        const input: Record<string, unknown> = {
            image: imageForReplicate,
            upscale_mode,
            target,
            factor,
            enhance_realism,
            enhance_details,
            output_format,
            output_quality: OUTPUT_QUALITY,
            no_op: false,
        };

        let output: unknown;
        try {
            output = await replicate.run(MODEL, { input });
        } catch (err) {
            console.error("[image-upscale] replicate error:", err);
            const { status, message } = mapReplicateModelError(err, GENERIC_ERROR);
            void insertGenerationRecord({
                userId: user.id,
                tool: "image_upscale",
                status: "failed",
                settings: {
                    prompt: summaryPrompt,
                    suite_tool: "upscale",
                    style: "image_upscale",
                    source_images: [raw],
                    upscale_mode,
                    factor,
                    enhance_realism,
                    enhance_details,
                    output_format,
                    output_quality: OUTPUT_QUALITY,
                    source_content_type: storedSourceMime,
                },
                errorMessage: message,
            });
            return NextResponse.json({ error: message }, { status });
        }

        const deliveryUrls = extractUrlsFromReplicateOutput(output);

        if (!deliveryUrls.length) {
            console.error("[image-upscale] empty or unrecognized output:", output);
            void insertGenerationRecord({
                userId: user.id,
                tool: "image_upscale",
                status: "failed",
                settings: {
                    prompt: summaryPrompt,
                    suite_tool: "upscale",
                    style: "image_upscale",
                    source_images: [raw],
                    upscale_mode,
                    factor,
                    enhance_realism,
                    enhance_details,
                    output_format,
                    output_quality: OUTPUT_QUALITY,
                    source_content_type: storedSourceMime,
                },
                errorMessage: GENERIC_ERROR,
            });
            return NextResponse.json(
                { error: GENERIC_ERROR },
                { status: 502 },
            );
        }

        const defaultMime =
            output_format === "png"
                ? "image/png"
                : output_format === "webp"
                  ? "image/webp"
                  : "image/jpeg";

        let persistedImages: string[];
        try {
            persistedImages = await mirrorReplicateUrlsToR2(deliveryUrls, {
                keyPrefix: `image-upscale/${user.id}`,
                defaultContentType: defaultMime,
            });
        } catch (mirrorErr) {
            console.error("[image-upscale] mirror to R2 failed:", mirrorErr);
            const msg =
                mirrorErr instanceof Error
                    ? mirrorErr.message
                    : "Could not save the result. Please try again.";
            void insertGenerationRecord({
                userId: user.id,
                tool: "image_upscale",
                status: "failed",
                settings: {
                    prompt: summaryPrompt,
                    suite_tool: "upscale",
                    style: "image_upscale",
                    source_images: [raw],
                    upscale_mode,
                    factor,
                    enhance_realism,
                    enhance_details,
                    output_format,
                    output_quality: OUTPUT_QUALITY,
                    source_content_type: storedSourceMime,
                },
                errorMessage: msg,
            });
            return NextResponse.json(
                { error: msg },
                { status: 502 },
            );
        }

        const consumed = await consumeGeneration(user.id, "image_upscale");
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
            tool: "image_upscale",
            status: "ok",
            settings: {
                prompt: summaryPrompt,
                suite_tool: "upscale",
                style: "image_upscale",
                source_images: [raw],
                upscale_mode,
                factor,
                enhance_realism,
                enhance_details,
                output_format,
                output_quality: OUTPUT_QUALITY,
                source_content_type: storedSourceMime,
            },
            result: { images: persistedImages },
        });

        return NextResponse.json({
            images: persistedImages,
            generations: consumed.status,
            record_id: recordId > 0 ? String(recordId) : undefined,
        });
    } catch (error) {
        console.error("[image-upscale] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
