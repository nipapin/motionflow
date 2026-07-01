import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { uploadBufferToR2 } from "@/lib/r2-storage";

export const runtime = "nodejs";
/** Two Whisper runs on longer files can take several minutes. */
export const maxDuration = 300;

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/** @see https://replicate.com/vaibhavs10/incredibly-fast-whisper */
const CAPTIONS_MODEL =
    "vaibhavs10/incredibly-fast-whisper:3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c" as const;

const MP3_CONTENT_TYPES = new Set(["audio/mpeg", "audio/mp3"]);
const MAX_BYTES = 25 * 1024 * 1024;

const GENERIC_ERROR =
    "We couldn't generate captions right now. Please try again in a moment.";

type WhisperTimestamp = "chunk" | "word";

function mapReplicateError(error: unknown): { status: number; message: string } {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const statusMatch = raw.match(/status\s+(\d{3})/i);
    const status = statusMatch ? Number(statusMatch[1]) : 500;

    if (status === 401 || status === 403) {
        return {
            status: 503,
            message:
                "The captions service is temporarily unavailable. Please try again later.",
        };
    }

    if (status === 402 || /insufficient credit/i.test(raw)) {
        return {
            status: 503,
            message:
                "The captions service is temporarily unavailable. Please try again later or contact support.",
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
            message: "We couldn't read this MP3 file. Please try a different file.",
        };
    }

    if (status >= 500 && status < 600) {
        return {
            status: 503,
            message:
                "The captions service is having issues right now. Please try again shortly.",
        };
    }

    return { status: 500, message: GENERIC_ERROR };
}

function isMp3File(file: File): boolean {
    const type = (file.type || "").toLowerCase();
    if (MP3_CONTENT_TYPES.has(type)) return true;
    return file.name.toLowerCase().endsWith(".mp3");
}

function hasTranscription(output: unknown): boolean {
    if (!output || typeof output !== "object") {
        return typeof output === "string" && output.trim().length > 0;
    }

    const record = output as { text?: unknown; chunks?: unknown };
    if (typeof record.text === "string" && record.text.trim()) return true;
    return Array.isArray(record.chunks) && record.chunks.length > 0;
}

async function transcribe(
    audioUrl: string,
    timestamp: WhisperTimestamp,
): Promise<unknown> {
    return replicate.run(CAPTIONS_MODEL, {
        input: {
            audio: audioUrl,
            task: "transcribe",
            language: "None",
            batch_size: 24,
            timestamp,
            diarise_audio: false,
        },
    });
}

export async function POST(req: NextRequest) {
    try {
        if (!process.env.REPLICATE_API_TOKEN) {
            console.error(
                "[captions generation] REPLICATE_API_TOKEN is not configured",
            );
            return NextResponse.json(
                {
                    error:
                        "Caption generation isn't available right now. Please try again later.",
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
                { error: "Please attach an MP3 file." },
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
                { error: "MP3 file must be under 25 MB." },
                { status: 400 },
            );
        }
        if (!isMp3File(file)) {
            return NextResponse.json(
                { error: "Only MP3 files are supported." },
                { status: 400 },
            );
        }

        let audioUrl: string;
        try {
            const buf = Buffer.from(await file.arrayBuffer());
            const uploaded = await uploadBufferToR2(buf, {
                contentType: "audio/mpeg",
                keyPrefix: "captions-input",
            });
            audioUrl = uploaded.url;
        } catch (uploadErr) {
            console.error("[captions generation] R2 upload failed:", uploadErr);
            return NextResponse.json(
                { error: "Could not upload the audio file. Please try again." },
                { status: 502 },
            );
        }

        let words: unknown;
        let chunk: unknown;
        try {
            [words, chunk] = await Promise.all([
                transcribe(audioUrl, "word"),
                transcribe(audioUrl, "chunk"),
            ]);
        } catch (err) {
            console.error("[captions generation] replicate error:", err);
            const { status, message } = mapReplicateError(err);
            return NextResponse.json({ error: message }, { status });
        }

        if (!hasTranscription(words) && !hasTranscription(chunk)) {
            console.error("[captions generation] empty transcription output");
            return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
        }

        return NextResponse.json({ words, chunk });
    } catch (error) {
        console.error("[captions generation] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}

