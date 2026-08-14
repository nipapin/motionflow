import { NextRequest, NextResponse } from "next/server";
import Replicate from "replicate";
import { LANGUAGE_NAMES } from "@/lib/generation-languages";
import {
  bearerFromRequest,
  identityFromJsonBody,
  requireCaptionsAuth,
} from "@/lib/auth/resolve-captions-user";
import { GENERATION_LIMIT_REACHED_CODE } from "@/lib/ai-generation-gate";
import {
  consumeGenerationForResolvedUser,
  generationsStatusForResolvedUser,
  billableAccountRequiredResponse,
  isBillableCepUser,
} from "@/lib/cep-generations";
import {
  durationGenerationsCost,
  durationFromTimestampChunks,
  parseDurationSeconds,
  resolveMeterDuration,
} from "@/lib/generation-cost";
import { verifyCaptionsChaptersReceipt } from "@/lib/captions-chapters-receipt";

export const runtime = "nodejs";
export const maxDuration = 120;

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

/** @see https://replicate.com/anthropic/claude-4.5-haiku */
const CHAPTERS_MODEL =
    "anthropic/claude-4.5-haiku:1ad171f62532e2099a3ed7d8d80327911f5f8d332e83cf4c8959da0be9a8bf3e" as const;

const MAX_CHUNKS = 500;
/** Cap on transcript size fed to the model (cost / abuse bound after auth). */
const MAX_TRANSCRIPT_CHARS = 40_000;
const TITLE_COUNT = 3;
const MIN_TAGS = 8;
const MAX_TAGS = 15;

const GENERIC_ERROR =
    "We couldn't generate chapters for this transcript right now. Please try again in a moment.";

type InputChunk = { text: string; timestamp: [number, number] };
type Section = { topic: string; time: number };

/** Что генерировать за этот вызов — "all" на первой генерации, остальное на точечный Regenerate. */
type Target = "all" | "titles" | "chapters" | "description" | "tags";
const TARGETS: Target[] = ["all", "titles", "chapters", "description", "tags"];

type ChaptersResponse = {
    titles?: string[];
    sections?: Section[];
    description?: string;
    tags?: string[];
};

function isTarget(value: unknown): value is Target {
    return typeof value === "string" && (TARGETS as string[]).includes(value);
}

function mapReplicateError(error: unknown): { status: number; message: string } {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const statusMatch = raw.match(/status\s+(\d{3})/i);
    const status = statusMatch ? Number(statusMatch[1]) : 500;

    if (status === 401 || status === 403) {
        return {
            status: 503,
            message: "The chapters service is temporarily unavailable. Please try again later.",
        };
    }

    if (status === 402 || /insufficient credit/i.test(raw)) {
        return {
            status: 503,
            message:
                "The chapters service is temporarily unavailable. Please try again later or contact support.",
        };
    }

    if (status === 429 || /rate.?limit/i.test(raw)) {
        return {
            status: 429,
            message: "Too many requests right now. Please wait a moment and try again.",
        };
    }

    if (status === 422 || /unprocessable|validation failed|invalid_fields/i.test(raw)) {
        return {
            status: 503,
            message: "The chapters service rejected the request. Please try again shortly.",
        };
    }

    if (status >= 500 && status < 600) {
        return {
            status: 503,
            message: "The chapters service is having issues right now. Please try again shortly.",
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

// system prompt собираем по запрошенным полям — точечный Regenerate не должен
// тратить токены/контекст модели на части, которые всё равно отбросим
function systemPromptFor(target: Target, languageName?: string): string {
    const wantTitles = target === "all" || target === "titles";
    const wantChapters = target === "all" || target === "chapters";
    const wantDescription = target === "all" || target === "description";
    const wantTags = target === "all" || target === "tags";

    const shapeParts: string[] = [];
    if (wantTitles) shapeParts.push('"titles": string[]');
    if (wantChapters) shapeParts.push('"sections": [{"topic": string, "start_index": number}, ...]');
    if (wantDescription) shapeParts.push('"description": string');
    if (wantTags) shapeParts.push('"tags": string[]');

    const lines = [
        "You analyze video transcripts to produce YouTube metadata.",
        "Respond with ONLY a single JSON object, no prose, no markdown code fences.",
        `Shape: {${shapeParts.join(", ")}}.`,
        "",
    ];

    // язык вывода — независимо от языка транскрипта; относится ко ВСЕМ
    // запрошенным полям разом, чтобы title/description/tags/главы не разъезжались
    if (languageName) {
        lines.push(
            `Write every requested field of your response in ${languageName}, regardless of what`,
            "language the transcript below is written in. Keep this consistent across all fields.",
            "",
        );
    }

    if (wantTitles) {
        lines.push(
            `"titles": exactly ${TITLE_COUNT} short, catchy, click-worthy YouTube video title options based on`,
            "the content of the transcript, written in the style of currently popular/trending YouTube titles",
            "(curiosity-driven, specific, no clickbait that misrepresents the content). Max ~70 characters each.",
            "",
        );
    }

    if (wantChapters) {
        lines.push(
            '"sections": split the transcript into topical chapters for chapter markers.',
            '"topic" is a short section title, 2-6 words, no trailing punctuation.',
            '"start_index" is the index (from the numbered transcript) of the first sentence of that section.',
            "The first item must have start_index 0. Indices must strictly increase and stay within range.",
            "Use as many sections as the content naturally calls for — usually 2 to 10 for a typical video.",
            "Never create a section for every sentence; group by subject, not by sentence.",
            "",
        );
    }

    if (wantDescription) {
        lines.push(
            '"description": a YouTube video description, 2-4 sentences, summarizing the content in an',
            "engaging, SEO-friendly tone with natural keywords from the transcript. No hashtags, no",
            "timestamps/chapter list (those are handled separately), no markdown. Max ~700 characters.",
            "",
        );
    }

    if (wantTags) {
        lines.push(
            `"tags": ${MIN_TAGS}-${MAX_TAGS} relevant YouTube search tags (single words or short phrases),`,
            'ordered by relevance, no "#" prefix, no duplicates, no surrounding quotes.',
        );
    }

    return lines.join("\n").trimEnd();
}

function buildPrompt(chunks: InputChunk[]): string {
    const numbered = chunks.map((c, i) => `${i}: ${c.text.trim()}`).join("\n");
    return `Transcript (one sentence per line, "index: sentence"):\n\n${numbered}`;
}

// модель иногда оборачивает ответ в ```json ... ``` несмотря на system prompt — снимаем обёртку
function extractJsonObject(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const raw = (fenced ? fenced[1] : text).trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
        throw new Error("Model did not return a JSON object");
    }
    return JSON.parse(raw.slice(start, end + 1));
}

function toTitles(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const titles: string[] = [];
    for (const item of raw) {
        let text = "";
        if (typeof item === "string") {
            text = item.trim();
        } else if (item && typeof item === "object") {
            // Claude sometimes returns [{title: "..."}] instead of string[]
            const row = item as Record<string, unknown>;
            if (typeof row.title === "string") text = row.title.trim();
            else if (typeof row.text === "string") text = row.text.trim();
            else if (typeof row.name === "string") text = row.name.trim();
        }
        if (text) titles.push(text);
        if (titles.length >= TITLE_COUNT) break;
    }
    return titles;
}

// index -> реальный таймкод из транскрипта; не доверяем модели точные секунды напрямую
function toSections(raw: unknown, chunks: InputChunk[]): Section[] {
    if (!Array.isArray(raw)) throw new Error("Model output has no sections array");

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

function toDescription(raw: unknown): string {
    return typeof raw === "string" ? raw.trim() : "";
}

function toTags(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const item of raw) {
        if (typeof item !== "string") continue;
        const tag = item.trim().replace(/^#/, "");
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
        if (tags.length >= MAX_TAGS) break;
    }
    return tags;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => null);

        const access = await requireCaptionsAuth({
            ...identityFromJsonBody(body),
            bearer: bearerFromRequest(req),
        });
        if (!access.ok) return access.response;
        const user = access.user;
        if (!isBillableCepUser(user)) return billableAccountRequiredResponse();

        if (!process.env.REPLICATE_API_TOKEN) {
            console.error("[chapters generation] REPLICATE_API_TOKEN is not configured");
            return NextResponse.json(
                { error: "Chapters generation isn't available right now. Please try again later." },
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

        const rawTarget = (body as { target?: unknown } | null)?.target;
        if (rawTarget !== undefined && !isTarget(rawTarget)) {
            return NextResponse.json(
                { error: `Invalid "target". Expected one of: ${TARGETS.join(", ")}.` },
                { status: 400 },
            );
        }
        const target: Target = isTarget(rawTarget) ? rawTarget : "all";

        const rawLanguage = (body as { language?: unknown } | null)?.language;
        if (rawLanguage !== undefined && (typeof rawLanguage !== "string" || !LANGUAGE_NAMES[rawLanguage])) {
            return NextResponse.json(
                { error: `Invalid "language". Expected one of: ${Object.keys(LANGUAGE_NAMES).join(", ")}.` },
                { status: 400 },
            );
        }
        const languageName = typeof rawLanguage === "string" ? LANGUAGE_NAMES[rawLanguage] : undefined;

        const chunks = rawChunks.filter(isInputChunk);
        if (!chunks.length) {
            return NextResponse.json(
                { error: "No valid transcript chunks were provided." },
                { status: 400 },
            );
        }
        if (chunks.length > MAX_CHUNKS) {
            return NextResponse.json(
                { error: `Transcript is too long for chapter generation (max ${MAX_CHUNKS} sentences).` },
                { status: 400 },
            );
        }

        const prompt = buildPrompt(chunks);
        if (prompt.length > MAX_TRANSCRIPT_CHARS) {
            return NextResponse.json(
                { error: "Transcript is too long for chapter generation." },
                { status: 400 },
            );
        }

        // Captions+Chapters one-shot: free only with a signed server receipt
        // from /api/generations/captions (client flag is ignored).
        // Standalone "all" → ceil(min/10). Section regenerate → 1.
        const receiptToken = (body as { chaptersReceipt?: unknown } | null)
            ?.chaptersReceipt;
        const receiptOk =
            typeof user.id === "number" &&
            verifyCaptionsChaptersReceipt(receiptToken, user.id).ok;
        const clientDuration = parseDurationSeconds(
            (body as { durationSeconds?: unknown } | null)?.durationSeconds,
        );
        const chunkDuration = durationFromTimestampChunks(chunks);
        const meterSeconds = resolveMeterDuration({
            clientSeconds: clientDuration,
            fromTimestamps: chunkDuration,
        });

        let cost: number;
        if (receiptOk && target === "all") {
            cost = 0;
        } else if (target === "all") {
            cost = durationGenerationsCost(meterSeconds);
        } else {
            cost = 1;
        }

        const preStatus = await generationsStatusForResolvedUser(user);
        if (cost > 0 && preStatus.total_generations_left < cost) {
            return NextResponse.json(
                {
                    code: GENERATION_LIMIT_REACHED_CODE,
                    error: "GENERATION_LIMIT_REACHED",
                    ...preStatus,
                    cost,
                },
                { status: 402 },
            );
        }

        const wantTitles = target === "all" || target === "titles";
        const wantChapters = target === "all" || target === "chapters";
        const wantDescription = target === "all" || target === "description";
        const wantTags = target === "all" || target === "tags";
        // Claude on Replicate requires max_tokens >= 1024 (422 otherwise).
        const maxTokens = target === "all" || target === "chapters" ? 3072 : 1024;

        const runOnce = async (): Promise<ChaptersResponse> => {
            let output: unknown;
            try {
                output = await replicate.run(CHAPTERS_MODEL, {
                    input: {
                        prompt,
                        system_prompt: systemPromptFor(target, languageName),
                        max_tokens: maxTokens,
                    },
                });
            } catch (err) {
                console.error("[chapters generation] replicate error:", err);
                const mapped = mapReplicateError(err);
                const e = new Error(mapped.message) as Error & {
                    status?: number;
                    code?: string;
                };
                e.status = mapped.status;
                e.code = "CHAPTERS_REPLICATE_FAILED";
                throw e;
            }

            const text = Array.isArray(output) ? output.join("") : String(output ?? "");
            try {
                const parsed = extractJsonObject(text) as Record<string, unknown>;
                const result: ChaptersResponse = {};
                if (wantTitles) {
                    result.titles = toTitles(parsed.titles);
                    if (!result.titles.length) {
                        throw new Error("empty titles output");
                    }
                }
                if (wantChapters) {
                    const sections = toSections(parsed.sections, chunks);
                    if (!sections.length) throw new Error("empty sections output");
                    result.sections = sections;
                }
                if (wantDescription) result.description = toDescription(parsed.description);
                if (wantTags) result.tags = toTags(parsed.tags);
                return result;
            } catch (parseErr) {
                console.error(
                    "[chapters generation] failed to parse model output:",
                    parseErr,
                    text.slice(0, 2000),
                );
                const e = new Error(
                    parseErr instanceof Error ? parseErr.message : "parse failed",
                ) as Error & { status?: number; code?: string };
                e.status = 502;
                e.code = "CHAPTERS_PARSE_FAILED";
                throw e;
            }
        };

        // One retry — Haiku occasionally returns empty / non-JSON for titles-only.
        let result: ChaptersResponse | null = null;
        let lastErr: (Error & { status?: number; code?: string }) | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                result = await runOnce();
                break;
            } catch (err) {
                lastErr = err as Error & { status?: number; code?: string };
                if (lastErr.code === "CHAPTERS_REPLICATE_FAILED") break;
                console.warn(
                    `[chapters generation] attempt ${attempt + 1} failed:`,
                    lastErr.message,
                );
            }
        }

        if (!result) {
            const status = lastErr?.status ?? 502;
            const message =
                lastErr?.code === "CHAPTERS_REPLICATE_FAILED"
                    ? lastErr.message
                    : GENERIC_ERROR;
            return NextResponse.json(
                {
                    error: message,
                    code: lastErr?.code ?? "CHAPTERS_FAILED",
                },
                { status },
            );
        }

        let consumed;
        try {
            consumed = await consumeGenerationForResolvedUser(user, "chapters", cost);
        } catch (consumeErr) {
            console.error("[chapters generation] consume failed:", consumeErr);
            return NextResponse.json(
                {
                    error: GENERIC_ERROR,
                    code: "CHAPTERS_CONSUME_FAILED",
                },
                { status: 500 },
            );
        }
        if (!consumed.ok) {
            return NextResponse.json(
                {
                    code: GENERATION_LIMIT_REACHED_CODE,
                    error: "GENERATION_LIMIT_REACHED",
                    ...consumed.status,
                    cost,
                },
                { status: 402 },
            );
        }

        return NextResponse.json({
            ...result,
            generations: consumed.status,
            cost,
            durationSeconds: meterSeconds || undefined,
        });
    } catch (error) {
        console.error("[chapters generation] unexpected error:", error);
        return NextResponse.json(
            { error: GENERIC_ERROR, code: "CHAPTERS_UNEXPECTED" },
            { status: 500 },
        );
    }
}
