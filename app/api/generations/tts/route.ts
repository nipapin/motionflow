import { NextRequest, NextResponse } from "next/server";
import Replicate, { type FileOutput } from "replicate";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
    consumeGeneration,
    getGenerationsStatus,
} from "@/lib/generations";
import { requireCreatorAiForGeneration } from "@/lib/creator-ai-generation-access";
import { insertGenerationRecord } from "@/lib/generation-records";
import { mirrorReplicateUrlsToR2 } from "@/lib/replicate-mirror-output";

export const runtime = "nodejs";
/** Long-running TTS jobs occasionally need more than the default 10s budget. */
export const maxDuration = 120;

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/** @see https://replicate.com/minimax/speech-2.8-hd/api/schema */
const TTS_MODEL = "minimax/speech-2.8-hd" as const;

/** Hard product cap, in addition to the 10 000 model cap. */
const MAX_TEXT_LENGTH = 1000;

const ALLOWED_VOICE_IDS = new Set<string>([
    "Wise_Woman",
    "Friendly_Person",
    "Inspirational_girl",
    "Deep_Voice_Man",
    "Calm_Woman",
    "Casual_Guy",
    "Lively_Girl",
    "Patient_Man",
    "Young_Knight",
    "Determined_Man",
    "Lovely_Girl",
    "Decent_Boy",
    "Imposing_Manner",
    "Elegant_Man",
    "Abbess",
    "Sweet_Girl_2",
    "Exuberant_Girl",
]);

const ALLOWED_EMOTIONS = new Set<string>([
    "auto",
    "neutral",
    "happy",
    "sad",
    "angry",
    "fearful",
    "disgusted",
    "surprised",
    "calm",
]);

const ALLOWED_AUDIO_FORMATS = new Set<string>(["mp3", "wav", "flac", "pcm"]);
const ALLOWED_CHANNELS = new Set<string>(["mono", "stereo"]);
const ALLOWED_SAMPLE_RATES = new Set<number>([
    8000, 16000, 22050, 24000, 32000, 44100,
]);
const ALLOWED_BITRATES = new Set<number>([
    32000, 64000, 128000, 192000, 256000,
]);
const ALLOWED_LANGUAGE_BOOST = new Set<string>([
    "None",
    "Automatic",
    "English",
    "Chinese",
    "Chinese,Yue",
    "Spanish",
    "French",
    "German",
    "Japanese",
    "Korean",
    "Russian",
    "Arabic",
    "Portuguese",
    "Italian",
    "Turkish",
    "Dutch",
    "Indonesian",
    "Vietnamese",
    "Thai",
    "Polish",
    "Romanian",
    "Greek",
    "Czech",
    "Hungarian",
    "Ukrainian",
    "Filipino",
    "Malay",
    "Hindi",
    "Hebrew",
    "Bengali",
]);

const CONTENT_TYPE_BY_FORMAT: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    pcm: "audio/pcm",
};

const GENERIC_ERROR =
    "We couldn't generate the audio right now. Please try again in a moment.";

function clampNumber(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return min;
    return Math.min(Math.max(value, min), max);
}

function mapReplicateError(error: unknown): { status: number; message: string } {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const statusMatch = raw.match(/status\s+(\d{3})/i);
    const status = statusMatch ? Number(statusMatch[1]) : 500;

    if (status === 401 || status === 403) {
        return {
            status: 503,
            message:
                "The speech service is temporarily unavailable. Please try again later.",
        };
    }

    if (status === 402 || /insufficient credit/i.test(raw)) {
        return {
            status: 503,
            message:
                "The speech service is temporarily unavailable. Please try again later or contact support.",
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
                "Your text couldn't be processed. Please rephrase it and try again.",
        };
    }

    if (status >= 500 && status < 600) {
        return {
            status: 503,
            message:
                "The speech service is having issues right now. Please try again shortly.",
        };
    }

    return { status: 500, message: GENERIC_ERROR };
}

function extractAudioUrl(output: unknown): string | null {
    if (typeof output === "string" && /^https?:\/\//i.test(output)) {
        return output;
    }
    const items = Array.isArray(output) ? output : [output];
    for (const item of items) {
        if (!item) continue;
        if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
        if (typeof item !== "object") continue;
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

interface TtsBody {
    text?: string;
    voice_id?: string;
    speed?: number;
    volume?: number;
    pitch?: number;
    emotion?: string;
    english_normalization?: boolean;
    sample_rate?: number;
    bitrate?: number;
    audio_format?: string;
    channel?: string;
    subtitle_enable?: boolean;
    language_boost?: string;
}

export async function POST(req: NextRequest) {
    try {
        const user = await getSessionUser();
        if (!user) {
            return NextResponse.json(
                { error: "Please sign in to generate speech." },
                { status: 401 },
            );
        }

        const creatorAi = await requireCreatorAiForGeneration(user.id);
        if (!creatorAi.ok) {
            return creatorAi.response;
        }

        if (!process.env.REPLICATE_API_TOKEN) {
            console.error(
                "[tts generation] REPLICATE_API_TOKEN is not configured",
            );
            return NextResponse.json(
                {
                    error:
                        "Text-to-speech isn't available right now. Please try again later.",
                },
                { status: 503 },
            );
        }

        const body = (await req.json().catch(() => ({}))) as TtsBody;

        const text = body.text?.trim();
        if (!text) {
            return NextResponse.json(
                { error: "Please enter the text you want to narrate." },
                { status: 400 },
            );
        }
        if (text.length > MAX_TEXT_LENGTH) {
            return NextResponse.json(
                {
                    error: `Text is too long. Please keep it under ${MAX_TEXT_LENGTH} characters.`,
                },
                { status: 400 },
            );
        }

        const voice_id =
            typeof body.voice_id === "string" && ALLOWED_VOICE_IDS.has(body.voice_id)
                ? body.voice_id
                : "Wise_Woman";

        const speed = clampNumber(
            typeof body.speed === "number" ? body.speed : 1,
            0.5,
            2,
        );
        const volume = clampNumber(
            typeof body.volume === "number" ? body.volume : 1,
            0,
            10,
        );
        const pitch = Math.round(
            clampNumber(typeof body.pitch === "number" ? body.pitch : 0, -12, 12),
        );

        const emotion =
            typeof body.emotion === "string" && ALLOWED_EMOTIONS.has(body.emotion)
                ? body.emotion
                : "auto";

        const english_normalization = Boolean(body.english_normalization);
        const subtitle_enable = Boolean(body.subtitle_enable);

        const audio_format =
            typeof body.audio_format === "string" &&
            ALLOWED_AUDIO_FORMATS.has(body.audio_format)
                ? body.audio_format
                : "mp3";
        const channel =
            typeof body.channel === "string" && ALLOWED_CHANNELS.has(body.channel)
                ? body.channel
                : "mono";

        const sample_rate =
            typeof body.sample_rate === "number" &&
            ALLOWED_SAMPLE_RATES.has(body.sample_rate)
                ? body.sample_rate
                : 32000;
        const bitrate =
            typeof body.bitrate === "number" && ALLOWED_BITRATES.has(body.bitrate)
                ? body.bitrate
                : 128000;

        const language_boost =
            typeof body.language_boost === "string" &&
            ALLOWED_LANGUAGE_BOOST.has(body.language_boost)
                ? body.language_boost
                : "None";

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

        const settings = {
            text,
            voice: voice_id,
            speed,
            volume,
            pitch,
            emotion,
            english_normalization,
            audio_format,
            channel,
            sample_rate,
            bitrate,
            language_boost,
            subtitle_enable,
        } as const;

        const input: Record<string, string | number | boolean> = {
            text,
            voice_id,
            speed,
            volume,
            pitch,
            emotion,
            english_normalization,
            sample_rate,
            audio_format,
            channel,
            language_boost,
            subtitle_enable,
        };
        if (audio_format === "mp3") {
            input.bitrate = bitrate;
        }

        let output: unknown;
        try {
            output = await replicate.run(TTS_MODEL, { input });
        } catch (err) {
            console.error("[tts generation] replicate error:", err);
            const { status, message } = mapReplicateError(err);
            void insertGenerationRecord({
                userId: user.id,
                tool: "tts",
                status: "failed",
                settings,
                errorMessage: message,
            });
            return NextResponse.json({ error: message }, { status });
        }

        const audioUrl = extractAudioUrl(output);
        if (!audioUrl) {
            console.error("[tts generation] empty replicate output");
            void insertGenerationRecord({
                userId: user.id,
                tool: "tts",
                status: "failed",
                settings,
                errorMessage: GENERIC_ERROR,
            });
            return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
        }

        let persistedAudioUrl: string;
        try {
            const [mirrored] = await mirrorReplicateUrlsToR2([audioUrl], {
                keyPrefix: `tts/${user.id}`,
                defaultContentType:
                    CONTENT_TYPE_BY_FORMAT[audio_format] ?? "audio/mpeg",
            });
            persistedAudioUrl = mirrored;
        } catch (mirrorErr) {
            console.error("[tts generation] mirror to R2 failed:", mirrorErr);
            const msg =
                mirrorErr instanceof Error
                    ? mirrorErr.message
                    : "Could not save the generated audio. Please try again.";
            void insertGenerationRecord({
                userId: user.id,
                tool: "tts",
                status: "failed",
                settings,
                errorMessage: msg,
            });
            return NextResponse.json({ error: msg }, { status: 502 });
        }

        const consumed = await consumeGeneration(user.id, "tts");
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
            tool: "tts",
            status: "ok",
            settings,
            result: { audio_url: persistedAudioUrl },
        });

        return NextResponse.json({
            audio_url: persistedAudioUrl,
            text,
            voice: voice_id,
            speed,
            audio_format,
            generations: consumed.status,
            record_id: recordId > 0 ? String(recordId) : undefined,
        });
    } catch (error) {
        console.error("[tts generation] unexpected error:", error);
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
    }
}
