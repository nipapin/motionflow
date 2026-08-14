import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import {
  bearerFromRequest,
  identityFromFormData,
  requireCaptionsAuth,
} from "@/lib/auth/resolve-captions-user";
import { GENERATION_LIMIT_REACHED_CODE } from "@/lib/ai-generation-gate";
import {
  LANGUAGE_NAMES,
  languageNameFor,
} from "@/lib/generation-languages";
import {
  generationsStatusForResolvedUser,
  consumeGenerationForResolvedUser,
  billableAccountRequiredResponse,
  isBillableCepUser,
} from "@/lib/cep-generations";
import { uploadBufferToR2 } from "@/lib/r2-storage";
import { issueCaptionsChaptersReceipt } from "@/lib/captions-chapters-receipt";
import {
  durationGenerationsCost,
  durationFromTimestampChunks,
  parseDurationSeconds,
  resolveMeterDuration,
} from "@/lib/generation-cost";

export const runtime = "nodejs";
/** Scribe v2 + optional translation on longer files can take several minutes. */
export const maxDuration = 300;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/** @see https://replicate.com/elevenlabs/scribe-v2 */
const CAPTIONS_MODEL =
  "elevenlabs/scribe-v2:5cd433d181bb49b09d24d61c770861b169253acf02e58865a39200c81e727676" as const;

/** Same Claude model as chapters — used for real target-language translation. */
const TRANSLATE_MODEL =
  "anthropic/claude-4.5-haiku:1ad171f62532e2099a3ed7d8d80327911f5f8d332e83cf4c8959da0be9a8bf3e" as const;

const MP3_CONTENT_TYPES = new Set(["audio/mpeg", "audio/mp3"]);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_TRANSLATE_CHARS = 40_000;

const GENERIC_ERROR =
  "We couldn't generate captions right now. Please try again in a moment.";

/** Sentence end — same rule as CEP sentencesFromWords. */
const SENTENCE_END = /[.!?…]["'»”’)\]]*$/;

type CaptionChunk = { text: string; timestamp: [number, number] };

type ScribeWord = {
  text: string;
  start?: number | null;
  end?: number | null;
  type: string;
  speaker_id?: string | null;
};

type ScribeOutput = {
  text: string;
  language_code?: string;
  language_probability?: number;
  duration_seconds?: number | null;
  words?: ScribeWord[] | null;
};

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

function asScribeOutput(output: unknown): ScribeOutput | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (typeof record.text !== "string") return null;
  return output as ScribeOutput;
}

function hasTranscription(output: ScribeOutput): boolean {
  if (output.text.trim()) return true;
  const words = output.words;
  if (!Array.isArray(words)) return false;
  return words.some(
    (w) =>
      w &&
      typeof w === "object" &&
      w.type === "word" &&
      typeof w.text === "string" &&
      w.text.trim().length > 0,
  );
}

/** Spoken words only — skip spacing / audio_event. */
function spokenWordChunks(output: ScribeOutput): CaptionChunk[] {
  const words = output.words;
  if (!Array.isArray(words)) return [];
  const out: CaptionChunk[] = [];
  for (const item of words) {
    if (!item || typeof item !== "object") continue;
    if (item.type !== "word") continue;
    if (typeof item.text !== "string" || !item.text.trim()) continue;
    if (typeof item.start !== "number" || typeof item.end !== "number") continue;
    out.push({
      text: item.text.trim(),
      timestamp: [item.start, item.end],
    });
  }
  return out;
}

function sentencesFromWords(words: CaptionChunk[]): CaptionChunk[] {
  const out: CaptionChunk[] = [];
  let cur: CaptionChunk[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({
      text: cur.map((w) => w.text.trim()).join(" "),
      timestamp: [cur[0].timestamp[0], cur[cur.length - 1].timestamp[1]],
    });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (SENTENCE_END.test(w.text.trim())) flush();
  }
  flush();
  return out;
}

async function transcribe(
  audioUrl: string,
  options: { language?: string },
): Promise<unknown> {
  return replicate.run(CAPTIONS_MODEL, {
    input: {
      audio: audioUrl,
      language_code: options.language?.trim() || "auto",
      timestamps_granularity: "word",
      diarize: false,
      tag_audio_events: false,
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

function wordsFromChunks(chunks: CaptionChunk[]): CaptionChunk[] {
  const MIN_WORD_SPAN = 0.02;
  const out: CaptionChunk[] = [];
  for (const c of chunks) {
    const tokens = c.text.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const start = Number(c.timestamp[0]) || 0;
    let end = Number(c.timestamp[1]) || 0;
    const minEnd = start + Math.max(MIN_WORD_SPAN * tokens.length, 0.05);
    if (!(end > start) || end < minEnd) end = minEnd;
    const span = end - start;
    const totalChars =
      tokens.reduce((sum, t) => sum + t.length, 0) || tokens.length;
    let cursor = start;
    for (let i = 0; i < tokens.length; i++) {
      const text = tokens[i];
      const share = text.length / totalChars;
      const wordEnd = i === tokens.length - 1 ? end : cursor + span * share;
      out.push({
        text,
        timestamp: [cursor, Math.max(wordEnd, cursor + MIN_WORD_SPAN)],
      });
      cursor = Math.max(wordEnd, cursor + MIN_WORD_SPAN);
    }
    out[out.length - 1] = {
      ...out[out.length - 1],
      timestamp: [
        Math.min(out[out.length - 1].timestamp[0], end - MIN_WORD_SPAN),
        end,
      ],
    };
  }
  return out;
}

/**
 * Translate caption chunk texts 1:1 into the target language, keeping timestamps.
 * Caller rebuilds word-level items via wordsFromChunks (proportional timings).
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

/** Apply translateTo while keeping Scribe response shape (text + words[]). */
function withTranslatedWords(
  base: ScribeOutput,
  wordChunks: CaptionChunk[],
): ScribeOutput {
  const text = wordChunks.map((c) => c.text).join(" ");
  const words: ScribeWord[] = wordChunks.map((c) => ({
    text: c.text,
    start: c.timestamp[0],
    end: c.timestamp[1],
    type: "word",
  }));
  return { ...base, text, words };
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

    const access = await requireCaptionsAuth({
      ...identityFromFormData(form),
      bearer: bearerFromRequest(req),
    });
    if (!access.ok) return access.response;
    if (!isBillableCepUser(access.user)) return billableAccountRequiredResponse();

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

    // Meter before the expensive ASR call: 1 gen per 10 minutes (ceil).
    // Client duration = In/Out / Work Area the panel already showed on the button.
    const clientDuration = parseDurationSeconds(form.get("durationSeconds"));
    const preCost = durationGenerationsCost(clientDuration ?? 0);
    const preStatus = await generationsStatusForResolvedUser(access.user);
    if (preStatus.total_generations_left < preCost) {
      return NextResponse.json(
        { code: GENERATION_LIMIT_REACHED_CODE, ...preStatus, cost: preCost },
        { status: 402 },
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

    let scribe: ScribeOutput;
    try {
      const raw = await transcribe(audioUrl, { language });
      const parsed = asScribeOutput(raw);
      if (!parsed) {
        console.error("[captions generation] unexpected scribe output shape");
        return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
      }
      scribe = parsed;
    } catch (err) {
      console.error("[captions generation] replicate error:", err);
      const { status, message } = mapReplicateError(err);
      return NextResponse.json({ error: message }, { status });
    }

    if (!hasTranscription(scribe)) {
      console.error("[captions generation] empty transcription output");
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
    }

    let translated = false;
    if (translateTo) {
      const languageName = languageNameFor(translateTo)!;
      try {
        const wordChunks = spokenWordChunks(scribe);
        const sentenceChunks = wordChunks.length
          ? sentencesFromWords(wordChunks)
          : [];
        const source = sentenceChunks.length
          ? sentenceChunks
          : wordChunks.length
            ? wordChunks
            : scribe.text.trim()
              ? [{ text: scribe.text.trim(), timestamp: [0, 0] as [number, number] }]
              : [];
        if (source.length) {
          const translatedChunks = await translateChunks(source, languageName);
          // ASR word timings no longer match translated text — rebuild words
          // with proportional timings, still in Scribe shape.
          const rebuilt = wordsFromChunks(translatedChunks);
          scribe = withTranslatedWords(scribe, rebuilt);
          translated = true;
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

    // Prefer max(client, ASR, word span) — never bill only on client claim.
    const wordSpan = durationFromTimestampChunks(spokenWordChunks(scribe));
    const asrDuration =
      typeof scribe.duration_seconds === "number" && scribe.duration_seconds > 0
        ? scribe.duration_seconds
        : undefined;
    const meterSeconds = resolveMeterDuration({
      clientSeconds: clientDuration,
      modelSeconds: asrDuration,
      fromTimestamps: wordSpan,
    });
    const finalCost = durationGenerationsCost(meterSeconds);

    // If ASR span is longer than the pre-check estimate, re-validate before consume.
    if (finalCost > preCost && preStatus.total_generations_left < finalCost) {
      return NextResponse.json(
        { code: GENERATION_LIMIT_REACHED_CODE, ...preStatus, cost: finalCost },
        { status: 402 },
      );
    }

    const consumed = await consumeGenerationForResolvedUser(
      access.user,
      "captions",
      finalCost,
    );
    if (!consumed.ok) {
      return NextResponse.json(
        { code: GENERATION_LIMIT_REACHED_CODE, ...consumed.status, cost: finalCost },
        { status: 402 },
      );
    }

    const chaptersReceipt =
      typeof access.user.id === "number"
        ? issueCaptionsChaptersReceipt({
            userId: access.user.id,
            durationSeconds: meterSeconds,
            cost: finalCost,
          })
        : undefined;

    return NextResponse.json({
      ...scribe,
      translated,
      cost: finalCost,
      durationSeconds: meterSeconds || undefined,
      chaptersReceipt,
      generations: consumed.status,
    });
  } catch (error) {
    console.error("[captions generation] unexpected error:", error);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
