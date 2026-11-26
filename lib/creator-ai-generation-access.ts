import "server-only";

import { NextResponse } from "next/server";
import { getGenerationsStatus } from "@/lib/generations";
import { getMotionflowGenerationPlan, type MotionflowGenerationPlan } from "@/lib/subscriptions";

export const CREATOR_AI_REQUIRED_CODE = "CREATOR_AI_REQUIRED" as const;

export type CreatorAiRequiredBody = {
  error: string;
  code: typeof CREATOR_AI_REQUIRED_CODE;
  plan: Exclude<MotionflowGenerationPlan, "creator_ai">;
};

/** Browser users can spend their allowance. CEP callers keep their subscription gate. */
export async function requireCreatorAiForGeneration(
  userId: number,
  cepClient?: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (cepClient) {
    const plan = await getMotionflowGenerationPlan(userId);
    if (plan === "creator_ai") return { ok: true };
    const body: CreatorAiRequiredBody = {
      error: plan === "none"
        ? "Creator + AI includes AI generation—see plans to get started."
        : "Add Creator + AI to your plan to unlock AI generation.",
      code: CREATOR_AI_REQUIRED_CODE,
      plan,
    };
    return { ok: false, response: NextResponse.json(body, { status: 403 }) };
  }

  const status = await getGenerationsStatus(userId);
  if (status.total_generations_left > 0) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json({
      error: "No generations remaining. Upgrade your plan or add more generations.",
      code: "GENERATION_LIMIT_REACHED",
      ...status,
      generations: status,
    }, { status: 402 }),
  };
}
