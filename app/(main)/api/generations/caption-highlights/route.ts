import { trackedReplicateFetch } from "@/lib/replicate-usage-fetch";
import { getReplicateApiToken } from "@/lib/replicate-auth";
import { NextRequest, NextResponse } from "next/server";
import { withGenerationActivity } from "@/lib/user-activity";
import Replicate from "replicate";
import { bearerFromRequest, requireCaptionsAuth } from "@/lib/auth/resolve-captions-user";
import { GENERATION_LIMIT_REACHED_CODE } from "@/lib/ai-generation-gate";
import { generationsStatusForResolvedUser, consumeGenerationForResolvedUser,
  billableAccountRequiredResponse, isMeteredCaptionsUser } from "@/lib/cep-generations";
import { analyzeCaptionHighlights, validateHighlightSegments, validateHighlightWords, highlightCaptionWords } from "@/lib/caption-highlights";

export const runtime = "nodejs";
export const maxDuration = 300;
const MODEL = "anthropic/claude-4.5-haiku:1ad171f62532e2099a3ed7d8d80327911f5f8d332e83cf4c8959da0be9a8bf3e" as const;
const cost = 1;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCaptionsAuth({ bearer: bearerFromRequest(req) });
    if (!auth.ok) return auth.response;
    if (!isMeteredCaptionsUser(auth.user)) return billableAccountRequiredResponse();
    return await withGenerationActivity(auth.user, "caption_highlights", async () => {
      const replicateApiToken = getReplicateApiToken(auth.user);
      if (!replicateApiToken) return NextResponse.json({ error: "AI highlights are temporarily unavailable." }, { status: 503 });
      const replicate = new Replicate({ auth: replicateApiToken, fetch: trackedReplicateFetch(auth.user) });
      const body = await req.json().catch(() => null);
      let segments: string[][] | undefined;
      let words: ReturnType<typeof validateHighlightWords> | undefined;
      try {
        if (body?.words !== undefined) words = validateHighlightWords(body.words);
        else segments = validateHighlightSegments(body?.segments);
      }
      catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
      const status = await generationsStatusForResolvedUser(auth.user);
      if (status.total_generations_left < cost) return NextResponse.json({
        code: GENERATION_LIMIT_REACHED_CODE, error: "GENERATION_LIMIT_REACHED", ...status, cost,
      }, { status: 402 });
      const generate = async (system_prompt: string, prompt: string) => {
        req.signal?.throwIfAborted();
        const output = await replicate.run(MODEL, { input: { system_prompt, prompt, max_tokens: 16384 }, signal: req.signal });
        return Array.isArray(output) ? output.join("") : String(output ?? "");
      };
      const result = words ? { words: await highlightCaptionWords(words, generate) }
        : { ranges: await analyzeCaptionHighlights(segments!, generate) };
      req.signal?.throwIfAborted();
      // Exactly one additional caption generation, independent of duration or batches.
      // Consume atomically only after a complete, validated model response.
      const consumed = await consumeGenerationForResolvedUser(auth.user, "captions", cost);
      if (!consumed.ok) return NextResponse.json({
        code: GENERATION_LIMIT_REACHED_CODE, error: "GENERATION_LIMIT_REACHED", ...consumed.status, cost,
      }, { status: 402 });
      return NextResponse.json({ ...result, cost, generations: consumed.status });
    });
  } catch (error) {
    console.error("[caption highlights] failed:", error);
    return NextResponse.json({ error: "Could not find AI highlights. Please try again.", code: "CAPTION_HIGHLIGHTS_FAILED" }, { status: 502 });
  }
}
