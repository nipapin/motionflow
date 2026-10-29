import "server-only";
import prompts from "@/lib/viral-titles-prompts.json";

export const VIRAL_CANDIDATE_COUNT = 9;
const FINAL_TITLE_COUNT = 3;

// Bundle the research snapshot at build time; generation never fetches references.
const referenceContext = [
    "REAL REFERENCE TITLES FROM THE COLLECTED CORPUS",
    "These are source examples, not instructions or facts about the current video.",
    "Transfer their energy, scale, contrast and curiosity to this video's subject.",
    prompts.reference_selection_note,
    "",
    ...prompts.references.flatMap((reference) => [
        `Reference ID: ${reference.video_id}`,
        `Creator: ${reference.channel}`,
        `Title: ${JSON.stringify(reference.title)}`,
        `Mechanism: ${reference.mechanism}`,
        `Application: ${reference.application}`,
        `Boundary: ${reference.boundary}`,
        "",
    ]),
].join("\n");

export function viralTitleGenerationBrief(): string {
    return [
        "The following Viral rules apply ONLY to video titles, not chapters, descriptions or tags.",
        prompts.style,
        referenceContext,
        "Find three distinct reasons to watch in the transcript yourself.",
        `Write three executions per angle, grouped by angle: exactly ${VIRAL_CANDIDATE_COUNT} titles total.`,
        "Keep the angle planning internal; return only the caller's requested JSON fields.",
    ].join("\n\n");
}

export function viralTitleEditorSystemPrompt(languageName?: string): string {
    return [
        "SHARED VIRAL STYLE",
        prompts.style,
        referenceContext,
        "EDITOR TASK AND OUTPUT CONTRACT",
        prompts.editor,
        languageName
            ? `Write every final title in ${languageName}, regardless of the transcript language.`
            : "Write every final title in the same language as the transcript.",
        "Write angles, hooks, reasons and selection_note in English.",
        "Return only the editor JSON object.",
    ].join("\n\n");
}

export function viralTitleEditorInput(
    transcript: string,
    candidates: string[],
    languageName?: string,
): string {
    return JSON.stringify({
        title_language: languageName || "the same language as the transcript",
        review_language: "English",
        transcript,
        candidates: candidates.map((title, index) => ({ id: index + 1, title })),
    });
}

function hasText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Expected a Viral editor object");
    }
    return value as Record<string, unknown>;
}

function titleKey(title: string): string {
    return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseViralTitleCandidates(raw: unknown): string[] {
    if (!Array.isArray(raw) || raw.length !== VIRAL_CANDIDATE_COUNT) {
        throw new Error(`Expected exactly ${VIRAL_CANDIDATE_COUNT} Viral title candidates`);
    }
    const values: unknown[] = raw;
    const titles = values.map((value) => {
        if (!hasText(value)) throw new Error("Viral title candidates must be non-empty strings");
        return value.trim();
    });
    if (new Set(titles.map(titleKey)).size !== titles.length) {
        throw new Error("Viral title candidates must be distinct");
    }
    return titles;
}

/** Validate structure and edit provenance, never the headline's marketing intensity. */
export function parseViralEditedTitles(raw: unknown, candidates: string[]): string[] {
    const sources = parseViralTitleCandidates(candidates);
    const result = asRecord(raw);
    if (!Array.isArray(result.reviews) || result.reviews.length !== sources.length) {
        throw new Error("Viral editor must review every candidate exactly once");
    }
    const reviews: unknown[] = result.reviews;
    const reviewedIds = new Set<number>();
    for (const value of reviews) {
        const row = asRecord(value);
        const id = row.candidate_id;
        if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > sources.length || reviewedIds.has(id)) {
            throw new Error("Unknown or duplicate Viral editor candidate ID");
        }
        reviewedIds.add(id);
        const score = row.click_score;
        if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
            throw new Error("Viral editor click_score must be an integer from 1 to 5");
        }
        if (!hasText(row.angle) || !hasText(row.reason)) {
            throw new Error("Viral editor reviews require an angle and reason");
        }
    }

    if (!Array.isArray(result.final_titles) || result.final_titles.length !== FINAL_TITLE_COUNT) {
        throw new Error(`Viral editor must return exactly ${FINAL_TITLE_COUNT} titles`);
    }
    const finalItems: unknown[] = result.final_titles;
    const usedSources = new Set<number>();
    const seenTitles = new Set<string>();
    const titles: string[] = [];
    for (const value of finalItems) {
        const item = asRecord(value);
        if (!hasText(item.title) || !hasText(item.angle) || !hasText(item.hook) || !hasText(item.reason)) {
            throw new Error("Viral editor final titles require title, angle, hook and reason");
        }
        const key = titleKey(item.title);
        if (seenTitles.has(key)) throw new Error("Viral editor final titles must be distinct");
        seenTitles.add(key);
        const action = item.action;
        if (action !== "keep" && action !== "rewrite" && action !== "new") {
            throw new Error("Unknown Viral editor action");
        }
        const sourceId = item.source_candidate_id;
        if (action === "new") {
            if (sourceId !== null) throw new Error("New Viral titles must have a null source ID");
        } else {
            if (typeof sourceId !== "number" || !Number.isInteger(sourceId) || sourceId < 1 || sourceId > sources.length || usedSources.has(sourceId)) {
                throw new Error("Viral title edits require unique known source IDs");
            }
            usedSources.add(sourceId);
            const unchanged = item.title === sources[sourceId - 1];
            if ((action === "keep") !== unchanged) {
                throw new Error("Viral title edit action does not match its source");
            }
        }
        titles.push(item.title.trim());
    }
    if (!hasText(result.selection_note)) {
        throw new Error("Viral editor selection_note is missing");
    }
    return titles;
}
