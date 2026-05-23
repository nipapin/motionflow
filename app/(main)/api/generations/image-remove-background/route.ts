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

const MODEL = "bria/remove-background" as const;

const GENERIC_ERROR =
    "We couldn't remove the background right now. Please try again in a moment.";

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
                "[image-remove-background] REPLICATE_API_TOKEN is not configured",
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
            content_moderation?: boolean;
        };

        const raw = body.image?.trim();
        if (!raw) {
            return NextResponse.json(
                { error: "Please upload an image to remove its background." },
                { status: 400 },
            );
        }

        if (!isAllowedSourceImageUrl(raw)) {
            return NextResponse.json(
                { error: "This image URL is not allowed." },
                { status: 400 },
            );
        }

        const preserve_alpha = true;
        const content_moderation = body.content_moderation === true;

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

        const input = {
            image: imageForReplicate,
            preserve_alpha,
            content_moderation,
        };

        let output: unknown;
        try {
            output = await replicate.run(MODEL, { input });
        } catch (err) {
            console.error("[image-remove-background] replicate error:", err);
            const { status, message } = mapReplicateModelError(err, GENERIC_ERROR);
            void insertGenerationRecord({
                userId: user.id,
                tool: "image_remove_bg",
                status: "failed",
                settings: {
                    prompt: "Remove background",
                    suite_tool: "remove_bg",
                    style: "image_remove_bg",
                    source_images: [raw],
                    preserve_alpha,
                    content_moderation,
                },
                errorMessage: message,
            });
            return NextResponse.json({ error: message }, { status });
        }

        const deliveryUrls = extractUrlsFromReplicateOutput(output);

        if (!deliveryUrls.length) {
            console.error(
                "[image-remove-background] empty or unrecognized output:",
                output,
            );
            void insertGenerationRecord({
                userId: user.id,
                tool: "image_remove_bg",
                status: "failed",
                settings: {
                    prompt: "Remove background",
                    suite_tool: "remove_bg",
                    style: "image_remove_bg",
                    source_images: [raw],
                    preserve_alpha,
                    content_moderation,
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
                keyPrefix: `image-remove-bg/${user.id}`,
                defaultContentType: "image/png",
            });
        } catch (mirrorErr) {
            console.error(
                "[image-remove-background] mirror to R2 failed:",
                mirrorErr,
            );
            const msg =
                mirrorErr instanceof Error
                    ? mirrorErr.message
                    : "Could not save the result. Please try again.";
            void insertGenerationRecord({
                userId: user.id,
                tool: "image_remove_bg",
                status: "failed",
                settings: {
                    prompt: "Remove background",
                    suite_tool: "remove_bg",
                    style: "image_remove_bg",
                    source_images: [raw],
                    preserve_alpha,
                    content_moderation,
                },
                errorMessage: msg,
            });
            return NextResponse.json(
                { error: msg },
                { status: 502 },
            );
        }

        const consumed = await consumeGeneration(user.id, "image_remove_bg");
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
            tool: "image_remove_bg",
            status: "ok",
            settings: {
                prompt: "Remove background",
                suite_tool: "remove_bg",
                style: "image_remove_bg",
                source_images: [raw],
                preserve_alpha,
                content_moderation,
            },
            result: { images: persistedImages },
        });

        return NextResponse.json({
            images: persistedImages,
            generations: consumed.status,
            record_id: recordId > 0 ? String(recordId) : undefined,
        });
    } catch (error) {
        console.error("[image-remove-background] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
