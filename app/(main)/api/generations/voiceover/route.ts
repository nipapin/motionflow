import { NextRequest, NextResponse } from "next/server";
import Replicate, { type FileOutput } from "replicate";
import {
  bearerFromRequest,
  identityFromJsonBody,
  requireCaptionsAccess,
} from "@/lib/auth/resolve-captions-user";
import { consumeGeneration, getGenerationsStatus } from "@/lib/generations";
import { GENERATION_LIMIT_REACHED_CODE } from "@/lib/ai-generation-gate";
import { insertGenerationRecord } from "@/lib/generation-records";
import { uploadBufferToR2 } from "@/lib/r2-storage";
import { resolveVoiceId } from "@/lib/cep-voiceover";

export const runtime = "nodejs";
/** CEP client timeout is 120s — keep the whole job inside that budget. */
export const maxDuration = 120;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/** Same MiniMax model as /api/generations/tts. */
const TTS_MODEL = "minimax/speech-2.8-hd" as const;

const MAX_TEXT_LENGTH = 3000;
const AUDIO_FORMAT = "mp3" as const;
const SAMPLE_RATE = 32000;
const BITRATE = 128000;

const GENERIC_ERROR =
  "We couldn't generate the voiceover right now. Please try again in a moment.";

interface VoiceoverBody {
  text?: unknown;
  voice_id?: unknown;
  speed?: unknown;
  email?: unknown;
  userId?: unknown;
  devToken?: unknown;
}

/**
 * POST /api/generations/voiceover — TTS for the CEP panel (MiniMax).
 * Auth: Bearer CEP token (preferred), web session cookie, or CEP dev identity.
 * Consumes 1 generation credit on success.
 * @see CEP/spunkram-library/docs/BACKEND_CEP_API.md §3.2
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as VoiceoverBody;

    const access = await requireCaptionsAccess({
      ...identityFromJsonBody(body),
      bearer: bearerFromRequest(req),
    });
    if (!access.ok) return access.response;
    const user = access.user;

    if (!process.env.REPLICATE_API_TOKEN) {
      console.error("[voiceover] REPLICATE_API_TOKEN is not configured");
      return NextResponse.json(
        { error: "SERVICE_UNAVAILABLE", message: "Voiceover isn't available right now." },
        { status: 503 },
      );
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json(
        { error: "INVALID_TEXT", message: "Please enter the narration text." },
        { status: 400 },
      );
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        {
          error: "TEXT_TOO_LONG",
          message: `Text is too long. Please keep it under ${MAX_TEXT_LENGTH} characters.`,
        },
        { status: 400 },
      );
    }

    const voiceId = resolveVoiceId(body.voice_id) ?? "Wise_Woman";
    const rawSpeed = typeof body.speed === "number" ? body.speed : 1;
    const speed = Math.min(Math.max(Number.isNaN(rawSpeed) ? 1 : rawSpeed, 0.5), 2);

    if (typeof user.id === "number") {
      const preStatus = await getGenerationsStatus(user.id);
      if (preStatus.total_generations_left <= 0) {
        return NextResponse.json(
          { code: GENERATION_LIMIT_REACHED_CODE, error: "GENERATION_LIMIT_REACHED", ...preStatus },
          { status: 402 },
        );
      }
    }

    const settings = {
      source: "cep-voiceover",
      text,
      voice: voiceId,
      speed,
      audio_format: AUDIO_FORMAT,
      sample_rate: SAMPLE_RATE,
      bitrate: BITRATE,
    } as const;

    let output: unknown;
    try {
      output = await replicate.run(TTS_MODEL, {
        input: {
          text,
          voice_id: voiceId,
          speed,
          audio_format: AUDIO_FORMAT,
          sample_rate: SAMPLE_RATE,
          bitrate: BITRATE,
          channel: "mono",
        },
      });
    } catch (err) {
      console.error("[voiceover] replicate error:", err);
      const { status, message } = mapReplicateError(err);
      if (typeof user.id === "number") {
        void insertGenerationRecord({
          userId: user.id,
          tool: "tts",
          status: "failed",
          settings,
          errorMessage: message,
        });
      }
      return NextResponse.json({ error: "GENERATION_FAILED", message }, { status });
    }

    const deliveryUrl = extractAudioUrl(output);
    if (!deliveryUrl) {
      console.error("[voiceover] empty replicate output");
      return NextResponse.json(
        { error: "GENERATION_FAILED", message: GENERIC_ERROR },
        { status: 502 },
      );
    }

    // Buffer the (expiring) Replicate delivery file ourselves so we can both
    // persist it to R2 and estimate duration from the CBR mp3 byte size.
    let audioBuffer: Buffer;
    try {
      const res = await fetch(deliveryUrl, {
        headers: process.env.REPLICATE_API_TOKEN
          ? { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` }
          : undefined,
      });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      audioBuffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.error("[voiceover] audio download failed:", err);
      return NextResponse.json(
        { error: "GENERATION_FAILED", message: GENERIC_ERROR },
        { status: 502 },
      );
    }

    let audioUrl: string;
    const fileName = `voiceover-${Date.now()}.mp3`;
    try {
      const uploaded = await uploadBufferToR2(audioBuffer, {
        contentType: "audio/mpeg",
        keyPrefix: `voiceover/${typeof user.id === "number" ? user.id : "dev"}`,
        extension: "mp3",
      });
      audioUrl = uploaded.url;
    } catch (err) {
      console.error("[voiceover] mirror to R2 failed:", err);
      return NextResponse.json(
        { error: "GENERATION_FAILED", message: GENERIC_ERROR },
        { status: 502 },
      );
    }

    const duration =
      Math.round(((audioBuffer.length * 8) / BITRATE) * 10) / 10;

    let generations: unknown;
    if (typeof user.id === "number") {
      const consumed = await consumeGeneration(user.id, "tts");
      if (!consumed.ok) {
        return NextResponse.json(
          { code: GENERATION_LIMIT_REACHED_CODE, error: "GENERATION_LIMIT_REACHED", ...consumed.status },
          { status: 402 },
        );
      }
      generations = consumed.status;
      void insertGenerationRecord({
        userId: user.id,
        tool: "tts",
        status: "ok",
        settings,
        result: { audio_url: audioUrl },
      });
    }

    return NextResponse.json({
      audio_url: audioUrl,
      duration,
      file_name: fileName,
      voice: voiceId,
      speed,
      generations,
    });
  } catch (error) {
    console.error("[voiceover] unexpected error:", error);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: GENERIC_ERROR },
      { status: 500 },
    );
  }
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

function mapReplicateError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const statusMatch = raw.match(/status\s+(\d{3})/i);
  const status = statusMatch ? Number(statusMatch[1]) : 500;

  if (status === 401 || status === 403 || status === 402 || /insufficient credit/i.test(raw)) {
    return {
      status: 503,
      message: "The speech service is temporarily unavailable. Please try again later.",
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
      message: "Your text couldn't be processed. Please rephrase it and try again.",
    };
  }
  if (status >= 500 && status < 600) {
    return {
      status: 503,
      message: "The speech service is having issues right now. Please try again shortly.",
    };
  }
  return { status: 500, message: GENERIC_ERROR };
}
