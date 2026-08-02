import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import {
  bearerFromRequest,
  identityFromJsonBody,
  requireCaptionsAccess,
} from "@/lib/auth/resolve-captions-user";
import { GENERATION_LIMIT_REACHED_CODE } from "@/lib/ai-generation-gate";
import {
  consumeGenerationForResolvedUser,
  generationsStatusForResolvedUser,
} from "@/lib/cep-generations";

export const runtime = "nodejs";
export const maxDuration = 120;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/** @see https://replicate.com/anthropic/claude-4.5-haiku */
const SECTIONS_MODEL =
  "anthropic/claude-4.5-haiku:1ad171f62532e2099a3ed7d8d80327911f5f8d332e83cf4c8959da0be9a8bf3e" as const;

const MAX_CHUNKS = 500;
/** Cap on transcript size fed to the model (cost / abuse bound after auth). */
const MAX_TRANSCRIPT_CHARS = 40_000;

const GENERIC_ERROR =
  "We couldn't split this transcript into sections right now. Please try again in a moment.";

type InputChunk = { text: string; timestamp: [number, number] };
type Section = { topic: string; time: number };

function mapReplicateError(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const statusMatch = raw.match(/status\s+(\d{3})/i);
  const status = statusMatch ? Number(statusMatch[1]) : 500;

  if (status === 401 || status === 403) {
    return {
      status: 503,
      message:
        "The sections service is temporarily unavailable. Please try again later.",
    };
  }

  if (status === 402 || /insufficient credit/i.test(raw)) {
    return {
      status: 503,
      message:
        "The sections service is temporarily unavailable. Please try again later or contact support.",
    };
  }

  if (status === 429 || /rate.?limit/i.test(raw)) {
    return {
      status: 429,
      message: "Too many requests right now. Please wait a moment and try again.",
    };
  }

  if (status >= 500 && status < 600) {
    return {
      status: 503,
      message:
        "The sections service is having issues right now. Please try again shortly.",
    };
  }

  return { status: 500, message: GENERIC_ERROR };
}

function isInputChunk(value: unknown): value is InputChunk {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.text === "string" &&
    c.text.trim().length > 0 &&
    Array.isArray(c.timestamp) &&
    c.timestamp.length === 2 &&
    typeof c.timestamp[0] === "number" &&
    typeof c.timestamp[1] === "number"
  );
}

const SYSTEM_PROMPT = [
  "You split video transcripts into topical sections for chapter markers.",
  "Respond with ONLY a JSON array, no prose, no markdown code fences.",
  'Each item: {"topic": string, "start_index": number}.',
  '"topic" is a short section title, 2-6 words, no trailing punctuation.',
  '"start_index" is the index (from the numbered transcript) of the first sentence of that section.',
  "The first item must have start_index 0. Indices must strictly increase and stay within range.",
  "Use as many sections as the content naturally calls for — usually 2 to 10 for a typical video.",
  "Never create a section for every sentence; group by subject, not by sentence.",
].join("\n");

function buildPrompt(chunks: InputChunk[]): string {
  const numbered = chunks.map((c, i) => `${i}: ${c.text.trim()}`).join("\n");
  return `Transcript (one sentence per line, "index: sentence"):\n\n${numbered}`;
}

// модель иногда оборачивает ответ в ```json ... ``` несмотря на system prompt — снимаем обёртку
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

// index -> реальный таймкод из транскрипта; не доверяем модели точные секунды напрямую
function toSections(raw: unknown, chunks: InputChunk[]): Section[] {
  if (!Array.isArray(raw)) throw new Error("Model output is not an array");

  const seen = new Set<number>();
  const sections: Section[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const topic = (item as Record<string, unknown>).topic;
    const startIndex = (item as Record<string, unknown>).start_index;
    if (typeof topic !== "string" || !topic.trim()) continue;
    if (typeof startIndex !== "number" || !Number.isInteger(startIndex)) continue;
    if (startIndex < 0 || startIndex >= chunks.length) continue;
    if (seen.has(startIndex)) continue;
    seen.add(startIndex);
    sections.push({ topic: topic.trim(), time: chunks[startIndex].timestamp[0] });
  }

  sections.sort((a, b) => a.time - b.time);
  return sections;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    const access = await requireCaptionsAccess({
      ...identityFromJsonBody(body),
      bearer: bearerFromRequest(req),
    });
    if (!access.ok) return access.response;
    const user = access.user;

    if (!process.env.REPLICATE_API_TOKEN) {
      console.error("[sections generation] REPLICATE_API_TOKEN is not configured");
      return NextResponse.json(
        { error: "Auto Sections isn't available right now. Please try again later." },
        { status: 503 },
      );
    }

    const rawChunks =
      body && Array.isArray((body as { chunks?: unknown }).chunks)
        ? (body as { chunks: unknown[] }).chunks
        : null;

    if (!rawChunks) {
      return NextResponse.json(
        { error: 'Expected a JSON body with a "chunks" array.' },
        { status: 400 },
      );
    }

    const chunks = rawChunks.filter(isInputChunk);
    if (!chunks.length) {
      return NextResponse.json(
        { error: "No valid transcript chunks were provided." },
        { status: 400 },
      );
    }
    if (chunks.length > MAX_CHUNKS) {
      return NextResponse.json(
        {
          error: `Transcript is too long for Auto Sections (max ${MAX_CHUNKS} sentences).`,
        },
        { status: 400 },
      );
    }

    const prompt = buildPrompt(chunks);
    if (prompt.length > MAX_TRANSCRIPT_CHARS) {
      return NextResponse.json(
        { error: "Transcript is too long for Auto Sections." },
        { status: 400 },
      );
    }

    if (typeof user.id === "number") {
      const preStatus = await generationsStatusForResolvedUser(user);
      if (preStatus.total_generations_left <= 0) {
        return NextResponse.json(
          {
            code: GENERATION_LIMIT_REACHED_CODE,
            error: "GENERATION_LIMIT_REACHED",
            ...preStatus,
          },
          { status: 402 },
        );
      }
    }

    let output: unknown;
    try {
      output = await replicate.run(SECTIONS_MODEL, {
        input: {
          prompt,
          system_prompt: SYSTEM_PROMPT,
          max_tokens: 2048,
        },
      });
    } catch (err) {
      console.error("[sections generation] replicate error:", err);
      const { status, message } = mapReplicateError(err);
      return NextResponse.json({ error: message }, { status });
    }

    const text = Array.isArray(output) ? output.join("") : String(output ?? "");

    let sections: Section[];
    try {
      sections = toSections(extractJsonArray(text), chunks);
    } catch (parseErr) {
      console.error(
        "[sections generation] failed to parse model output:",
        parseErr,
        text,
      );
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
    }

    if (!sections.length) {
      console.error("[sections generation] empty sections output");
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
    }

    let generations: unknown;
    if (typeof user.id === "number") {
      const consumed = await consumeGenerationForResolvedUser(user, "sections");
      if (!consumed.ok) {
        return NextResponse.json(
          {
            code: GENERATION_LIMIT_REACHED_CODE,
            error: "GENERATION_LIMIT_REACHED",
            ...consumed.status,
          },
          { status: 402 },
        );
      }
      generations = consumed.status;
    }

    return NextResponse.json({ sections, generations });
  } catch (error) {
    console.error("[sections generation] unexpected error:", error);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}
