import { trackedReplicateFetch } from "@/lib/replicate-usage-fetch";
import { getReplicateApiToken } from "@/lib/replicate-auth";
import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { resolveRequestUser, requestHasCepBearer } from "@/lib/auth/resolve-request-user";
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

const P_IMAGE_EDIT = "prunaai/p-image-edit" as const;

const ALLOWED_ASPECT_RATIOS = new Set([
    "match_input_image",
    "1:1",
    "16:9",
    "9:16",
]);

const GENERIC_ERROR =
    "We couldn't edit the image right now. Please try again in a moment.";

export async function POST(req: NextRequest) {
    try {
        const user = await resolveRequestUser(req);
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to edit images." },
                { status: 401 },
            );
        }

        const creatorAi = await requireCreatorAiForGeneration(user.id);
        if (!creatorAi.ok) {
            return creatorAi.response;
        }

        const replicateApiToken = getReplicateApiToken(user);
        if (!replicateApiToken) {
            console.error(
                "[image-edit] Replicate API token is not configured for this client",
            );
            return NextResponse.json(
                {
                    error:
                        "Image editing isn't available right now. Please try again later.",
                },
                { status: 503 },
            );
        }
        const replicate = new Replicate({ auth: replicateApiToken, fetch: trackedReplicateFetch(user) });

        const body = (await req.json().catch(() => ({}))) as {
            prompt?: string;
            images?: unknown;
            aspect_ratio?: string;
        };

        const prompt = body.prompt?.trim();
        const aspect_ratio = body.aspect_ratio ?? "match_input_image";

        if (!prompt) {
            return NextResponse.json(
                { error: "Please describe how you want to edit the image(s)." },
                { status: 400 },
            );
        }

        if (!ALLOWED_ASPECT_RATIOS.has(aspect_ratio)) {
            return NextResponse.json(
                { error: "Please choose a supported aspect ratio." },
                { status: 400 },
            );
        }

        const rawImages = Array.isArray(body.images) ? body.images : [];
        const cleaned = rawImages
            .filter((x): x is string => typeof x === "string")
            .map((s) => s.trim())
            .filter(Boolean);

        if (cleaned.length < 1 || cleaned.length > 5) {
            return NextResponse.json(
                {
                    error:
                        "Provide between 1 and 5 source image URLs (upload images or paste links).",
                },
                { status: 400 },
            );
        }

        for (const url of cleaned) {
            if (!isAllowedSourceImageUrl(url)) {
                return NextResponse.json(
                    { error: "One or more image URLs are not allowed." },
                    { status: 400 },
                );
            }
        }

        const imagesForReplicate = cleaned.map(normalizeImageUrlForReplicate);
        /** Multi-image runs use turbo; single image does not (matches product default). */
        const turbo = cleaned.length > 1;

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

        const input: Record<string, unknown> = {
            prompt,
            images: imagesForReplicate,
            aspect_ratio,
            turbo,
        };

        let output: unknown;
        try {
            output = await replicate.run(P_IMAGE_EDIT, { input });
        } catch (err) {
            console.error("[image-edit] replicate error:", err);
            const { status, message } = mapReplicateModelError(err, GENERIC_ERROR);
            await insertGenerationRecord({
                userId: user.id, source: requestHasCepBearer(req) ? "extension" : "web",
                tool: "image_edit",
                status: "failed",
                settings: {
                    kind: "image_edit",
                    suite_tool: "prompt_edit",
                    prompt,
                    aspect_ratio,
                    turbo,
                    style: "image_edit",
                    source_images: cleaned,
                },
                errorMessage: message,
            });
            return NextResponse.json({ error: message }, { status });
        }

        const deliveryUrls = extractUrlsFromReplicateOutput(output);

        if (!deliveryUrls.length) {
            console.error("[image-edit] empty or unrecognized output:", output);
            await insertGenerationRecord({
                userId: user.id, source: requestHasCepBearer(req) ? "extension" : "web",
                tool: "image_edit",
                status: "failed",
                settings: {
                    kind: "image_edit",
                    suite_tool: "prompt_edit",
                    prompt,
                    aspect_ratio,
                    turbo,
                    style: "image_edit",
                    source_images: cleaned,
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
                apiToken: replicateApiToken,
                keyPrefix: `image-edit/${user.id}`,
                defaultContentType: "image/png",
            });
        } catch (mirrorErr) {
            console.error("[image-edit] mirror to R2 failed:", mirrorErr);
            const msg =
                mirrorErr instanceof Error
                    ? mirrorErr.message
                    : "Could not save the edited image. Please try again.";
            await insertGenerationRecord({
                userId: user.id, source: requestHasCepBearer(req) ? "extension" : "web",
                tool: "image_edit",
                status: "failed",
                settings: {
                    kind: "image_edit",
                    suite_tool: "prompt_edit",
                    prompt,
                    aspect_ratio,
                    turbo,
                    style: "image_edit",
                    source_images: cleaned,
                },
                errorMessage: msg,
            });
            return NextResponse.json(
                { error: msg },
                { status: 502 },
            );
        }

        const consumed = await consumeGeneration(user.id, "image_edit");
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
            userId: user.id, source: requestHasCepBearer(req) ? "extension" : "web",
            tool: "image_edit",
            status: "ok",
            settings: {
                kind: "image_edit",
                suite_tool: "prompt_edit",
                prompt,
                aspect_ratio,
                turbo,
                style: "image_edit",
                source_images: cleaned,
            },
            result: { images: persistedImages },
        });

        return NextResponse.json({
            images: persistedImages,
            prompt,
            aspect_ratio,
            turbo,
            generations: consumed.status,
            record_id: recordId > 0 ? String(recordId) : undefined,
        });
    } catch (error) {
        console.error("[image-edit] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
