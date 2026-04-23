import "server-only";

import { NextResponse } from "next/server";
import {
  getMotionflowGenerationPlan,
  type MotionflowGenerationPlan,
} from "@/lib/subscriptions";

/**
 * AI image/video tools (and related uploads) are reserved for the Motion Flow
 * **Creator + AI** catalog subscription. Other plans use `getLimitForPlan` for
 * non-AI entitlements only; this gate is the source of truth for Replicate-backed routes.
 */
export const CREATOR_AI_REQUIRED_CODE = "CREATOR_AI_REQUIRED" as const;

export type CreatorAiRequiredBody = {
    error: string;
    code: typeof CREATOR_AI_REQUIRED_CODE;
    plan: Exclude<MotionflowGenerationPlan, "creator_ai">;
};

export async function requireCreatorAiForGeneration(
    userId: number,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
    const plan = await getMotionflowGenerationPlan(userId);
    if (plan === "creator_ai") {
        return { ok: true };
    }
    const error =
        plan === "none"
            ? "Creator + AI includes AI generation—see plans to get started."
            : "Add Creator + AI to your plan to unlock AI generation.";
    const body: CreatorAiRequiredBody = {
        error,
        code: CREATOR_AI_REQUIRED_CODE,
        plan,
    };
    return {
        ok: false,
        response: NextResponse.json(body, { status: 403 }),
    };
}
