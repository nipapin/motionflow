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
import { uploadBufferToR2 } from "@/lib/r2-storage";

export const runtime = "nodejs";
/** Whisper transcription can take a while for longer files. */
export const maxDuration = 300;

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/** @see https://replicate.com/openai/whisper */
const STT_MODEL =
    "openai/whisper:3c08daf437fe359eb158a5123c395673f0a113dd8b4bd01ddce5936850e2a981" as const;

/** 25 MB hard cap (matches Whisper API expectations for a single file). */
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_INPUT_TYPES = new Set<string>([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/flac",
    "audio/x-flac",
    "audio/ogg",
    "audio/webm",
    "audio/aac",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
]);

type OutputFormat = "text" | "srt" | "vtt";

const FORMAT_TO_TRANSCRIPTION: Record<OutputFormat, string> = {
    text: "plain text",
    srt: "srt",
    vtt: "vtt",
};

const GENERIC_ERROR =
    "We couldn't transcribe the audio right now. Please try again in a moment.";

function mapReplicateError(error: unknown): { status: number; message: string } {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const statusMatch = raw.match(/status\s+(\d{3})/i);
    const status = statusMatch ? Number(statusMatch[1]) : 500;

    if (status === 401 || status === 403) {
        return {
            status: 503,
            message:
                "The transcription service is temporarily unavailable. Please try again later.",
        };
    }

    if (status === 402 || /insufficient credit/i.test(raw)) {
        return {
            status: 503,
            message:
                "The transcription service is temporarily unavailable. Please try again later or contact support.",
        };
    }

    if (status === 429 || /rate.?limit/i.test(raw)) {
        return {
            status: 429,
            message:
                "Too many requests right now. Please wait a moment and try again.",
        };
    }

    if (status === 422) {
        return {
            status: 400,
            message:
                "We couldn't read this audio file. Please try a different file.",
        };
    }

    if (status >= 500 && status < 600) {
        return {
            status: 503,
            message:
                "The transcription service is having issues right now. Please try again shortly.",
        };
    }

    return { status: 500, message: GENERIC_ERROR };
}

interface WhisperOutput {
    transcription?: unknown;
    detected_language?: unknown;
    translation?: unknown;
}

function extractTranscription(output: unknown): {
    text: string;
    detectedLanguage: string | null;
} {
    if (output && typeof output === "object") {
        const o = output as WhisperOutput;
        const text =
            typeof o.transcription === "string"
                ? o.transcription
                : typeof o.translation === "string"
                  ? o.translation
                  : "";
        const detectedLanguage =
            typeof o.detected_language === "string" ? o.detected_language : null;
        return { text, detectedLanguage };
    }
    if (typeof output === "string") {
        return { text: output, detectedLanguage: null };
    }
    return { text: "", detectedLanguage: null };
}

function parseOutputFormat(value: unknown): OutputFormat {
    if (value === "srt" || value === "vtt" || value === "text") return value;
    return "text";
}

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to transcribe audio." },
                { status: 401 },
            );
        }

        const creatorAi = await requireCreatorAiForGeneration(user.id);
        if (!creatorAi.ok) {
            return creatorAi.response;
        }

        if (!process.env.REPLICATE_API_TOKEN) {
            console.error(
                "[stt generation] REPLICATE_API_TOKEN is not configured",
            );
            return NextResponse.json(
                {
                    error:
                        "Speech-to-text isn't available right now. Please try again later.",
                },
                { status: 503 },
            );
        }

        const form = await req.formData().catch(() => null);
        if (!form) {
            return NextResponse.json(
                { error: "Expected a multipart form upload." },
                { status: 400 },
            );
        }

        const file = form.get("file");
        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "Please attach an audio or video file." },
                { status: 400 },
            );
        }
        if (file.size <= 0) {
            return NextResponse.json(
                { error: "The uploaded file is empty." },
                { status: 400 },
            );
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json(
                { error: "Audio file must be under 25 MB." },
                { status: 400 },
            );
        }

        const contentType =
            (file.type || "application/octet-stream").toLowerCase();
        if (!ALLOWED_INPUT_TYPES.has(contentType)) {
            return NextResponse.json(
                {
                    error:
                        "Unsupported file type. Please upload MP3, WAV, M4A, FLAC, OGG, MP4 or MOV.",
                },
                { status: 400 },
            );
        }

        const outputFormat = parseOutputFormat(form.get("output_format"));
        const transcriptionFormat = FORMAT_TO_TRANSCRIPTION[outputFormat];

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

        let audioUrl: string;
        try {
            const buf = Buffer.from(await file.arrayBuffer());
            const uploaded = await uploadBufferToR2(buf, {
                contentType,
                keyPrefix: `stt-input/${user.id}`,
            });
            audioUrl = uploaded.url;
        } catch (uploadErr) {
            console.error("[stt generation] R2 upload failed:", uploadErr);
            return NextResponse.json(
                { error: "Could not upload the audio file. Please try again." },
                { status: 502 },
            );
        }

        const settings = {
            filename: file.name,
            size: file.size,
            mime: contentType,
            output_format: outputFormat,
            audio_url: audioUrl,
        } as const;

        const input: Record<string, string | number | boolean> = {
            audio: audioUrl,
            model: "large-v3",
            transcription: transcriptionFormat,
            translate: false,
            temperature: 0,
            condition_on_previous_text: true,
            no_speech_threshold: 0.6,
            logprob_threshold: -1,
            compression_ratio_threshold: 2.4,
            temperature_increment_on_fallback: 0.2,
        };

        let output: unknown;
        try {
            output = await replicate.run(STT_MODEL, { input });
        } catch (err) {
            console.error("[stt generation] replicate error:", err);
            const { status, message } = mapReplicateError(err);
            void insertGenerationRecord({
                userId: user.id,
                tool: "stt",
                status: "failed",
                settings,
                errorMessage: message,
            });
            return NextResponse.json({ error: message }, { status });
        }

        const { text, detectedLanguage } = extractTranscription(output);
        if (!text.trim()) {
            console.error("[stt generation] empty transcription output");
            void insertGenerationRecord({
                userId: user.id,
                tool: "stt",
                status: "failed",
                settings,
                errorMessage: GENERIC_ERROR,
            });
            return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
        }

        const consumed = await consumeGeneration(user.id, "stt");
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
            tool: "stt",
            status: "ok",
            settings,
            result: {
                text,
                output_format: outputFormat,
                detected_language: detectedLanguage,
            },
        });

        return NextResponse.json({
            text,
            output_format: outputFormat,
            detected_language: detectedLanguage,
            filename: file.name,
            generations: consumed.status,
            record_id: recordId > 0 ? String(recordId) : undefined,
        });
    } catch (error) {
        console.error("[stt generation] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
