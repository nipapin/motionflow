import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import {
  identityFromFormData,
  requireCaptionsAccess,
} from "@/lib/auth/resolve-captions-user";
import { GENERATION_LIMIT_REACHED_CODE } from "@/lib/ai-generation-gate";
import {
  LANGUAGE_NAMES,
  languageNameFor,
} from "@/lib/generation-languages";
import {
  consumeGeneration,
  getGenerationsStatus,
} from "@/lib/generations";
import { uploadBufferToR2 } from "@/lib/r2-storage";

export const runtime = "nodejs";
/** Two Whisper runs + optional translation on longer files can take several minutes. */
export const maxDuration = 300;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/** @see https://replicate.com/vaibhavs10/incredibly-fast-whisper */
const CAPTIONS_MODEL =
  "vaibhavs10/incredibly-fast-whisper:3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c" as const;

/** Same Claude model as chapters — used for real target-language translation. */
const TRANSLATE_MODEL =
  "anthropic/claude-4.5-haiku:1ad171f62532e2099a3ed7d8d80327911f5f8d332e83cf4c8959da0be9a8bf3e" as const;

const MP3_CONTENT_TYPES = new Set(["audio/mpeg", "audio/mp3"]);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_TRANSLATE_CHARS = 40_000;

const GENERIC_ERROR =
  "We couldn't generate captions right now. Please try again in a moment.";

type WhisperTimestamp = "chunk" | "word";

type CaptionChunk = { text: string; timestamp: [number, number] };

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

function asChunks(output: unknown): CaptionChunk[] {
  if (!output || typeof output !== "object") return [];
  const chunks = (output as { chunks?: unknown }).chunks;
  if (!Array.isArray(chunks)) return [];
  const out: CaptionChunk[] = [];
  for (const item of chunks) {
    if (!item || typeof item !== "object") continue;
    const text = (item as { text?: unknown }).text;
    const timestamp = (item as { timestamp?: unknown }).timestamp;
    if (typeof text !== "string" || !text.trim()) continue;
    if (
      !Array.isArray(timestamp) ||
      timestamp.length !== 2 ||
      typeof timestamp[0] !== "number" ||
      typeof timestamp[1] !== "number"
    ) {
      continue;
    }
    out.push({
      text: text.trim(),
      timestamp: [timestamp[0], timestamp[1]],
    });
  }
  return out;
}

async function transcribe(
  audioUrl: string,
  timestamp: WhisperTimestamp,
  options: { language?: string },
): Promise<unknown> {
  const language =
    options.language && options.language.trim()
      ? options.language.trim()
      : "None";

  return replicate.run(CAPTIONS_MODEL, {
    input: {
      audio: audioUrl,
      task: "transcribe",
      language,
      batch_size: 24,
      timestamp,
      diarise_audio: false,
    },
  });
}

function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a JSON array");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Translate caption chunk texts 1:1 into the target language, keeping timestamps.
 * Returns translated chunks; caller should clear word-level chunks (CEP falls back
 * to proportional timings when words are absent).
 */
async function translateChunks(
  chunks: CaptionChunk[],
  languageName: string,
): Promise<CaptionChunk[]> {
  if (!chunks.length) return chunks;

  const numbered = chunks
    .map((c, i) => `${i}: ${c.text}`)
    .join("\n");
  if (numbered.length > MAX_TRANSLATE_CHARS) {
    throw new Error("Transcript too long to translate");
  }

  const system_prompt = [
    "You translate video caption segments.",
    "Respond with ONLY a JSON array of strings, no prose, no markdown fences.",
    `Translate every line into ${languageName}.`,
    "Return exactly one string per input line, same order and same array length.",
    "Preserve meaning; keep punctuation natural for the target language.",
    "Do not merge or split segments.",
  ].join("\n");

  const prompt = `Caption segments (one per line, "index: text"):\n\n${numbered}`;

  const output = await replicate.run(TRANSLATE_MODEL, {
    input: {
      prompt,
      system_prompt,
      max_tokens: Math.min(8192, Math.max(1024, chunks.length * 40)),
    },
  });

  const text =
    typeof output === "string"
      ? output
      : Array.isArray(output)
        ? output.map(String).join("")
        : String(output ?? "");

  const parsed = extractJsonArray(text);
  if (!Array.isArray(parsed) || parsed.length !== chunks.length) {
    throw new Error(
      `Translation length mismatch: expected ${chunks.length}, got ${Array.isArray(parsed) ? parsed.length : "non-array"}`,
    );
  }

  return chunks.map((c, i) => {
    const t = parsed[i];
    const translated =
      typeof t === "string" && t.trim() ? t.trim() : c.text;
    return { text: translated, timestamp: c.timestamp };
  });
}

function withChunks(
  base: unknown,
  chunks: CaptionChunk[],
): Record<string, unknown> {
  const text = chunks.map((c) => c.text).join(" ");
  if (base && typeof base === "object") {
    return { ...(base as Record<string, unknown>), text, chunks };
  }
  return { text, chunks };
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

    const access = await requireCaptionsAccess(identityFromFormData(form));
    if (!access.ok) return access.response;

    console.info(
      "[captions generation] user",
      access.user.email,
      access.user.id,
      access.user.source,
    );

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

    const languageRaw = form.get("language");
    const translateRaw = form.get("translateTo");
    const language =
      typeof languageRaw === "string" &&
      languageRaw.trim() &&
      languageRaw.trim().toLowerCase() !== "auto"
        ? languageRaw.trim()
        : undefined;
    const translateTo =
      typeof translateRaw === "string" &&
      translateRaw.trim() &&
      translateRaw.trim().toLowerCase() !== "off"
        ? translateRaw.trim().toLowerCase()
        : undefined;

    if (translateTo && !LANGUAGE_NAMES[translateTo]) {
      return NextResponse.json(
        {
          error: `Invalid "translateTo". Expected one of: ${Object.keys(LANGUAGE_NAMES).join(", ")}.`,
        },
        { status: 400 },
      );
    }

    // Meter real session users before the expensive Whisper calls.
    if (typeof access.user.id === "number") {
      const preStatus = await getGenerationsStatus(access.user.id);
      if (preStatus.total_generations_left <= 0) {
        return NextResponse.json(
          { code: GENERATION_LIMIT_REACHED_CODE, ...preStatus },
          { status: 402 },
        );
      }
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
        transcribe(audioUrl, "word", { language }),
        transcribe(audioUrl, "chunk", { language }),
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

    // Real target-language translation (Whisper's built-in translate is English-only).
    if (translateTo) {
      const languageName = languageNameFor(translateTo)!;
      try {
        const sourceChunks = asChunks(chunk);
        const fallbackChunks = sourceChunks.length
          ? sourceChunks
          : asChunks(words);
        if (fallbackChunks.length) {
          const translated = await translateChunks(
            fallbackChunks,
            languageName,
          );
          chunk = withChunks(chunk, translated);
          // Drop word timings — CEP uses proportional timings when words are empty.
          words = {
            text: translated.map((c) => c.text).join(" "),
            chunks: [],
          };
        }
      } catch (err) {
        console.error("[captions generation] translate error:", err);
        const { status, message } = mapReplicateError(err);
        return NextResponse.json(
          {
            error:
              status === 500
                ? "We couldn't translate the captions. Please try again."
                : message,
          },
          { status: status === 500 ? 502 : status },
        );
      }
    }

    if (typeof access.user.id === "number") {
      const consumed = await consumeGeneration(access.user.id, "captions");
      if (!consumed.ok) {
        return NextResponse.json(
          { code: GENERATION_LIMIT_REACHED_CODE, ...consumed.status },
          { status: 402 },
        );
      }
    }

    return NextResponse.json({ words, chunk });
  } catch (error) {
    console.error("[captions generation] unexpected error:", error);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
