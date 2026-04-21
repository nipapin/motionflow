import type { AuthUser } from "@/components/auth-provider";
import type { GenerationStatus } from "@/hooks/use-generations";

/** Same value as `CREATOR_AI_REQUIRED_CODE` in `creator-ai-generation-access.ts` (API JSON). */
export const CREATOR_AI_REQUIRED_CODE = "CREATOR_AI_REQUIRED" as const;

export type AiGenerateBlockReason = "sign_in" | "needs_creator_ai" | "limit";

/**
 * Client-side guard for AI tools: aligns with {@link requireCreatorAiForGeneration} on the server.
 * Callers should skip when `generationsLoading` is true (do not open modals until status is known).
 */
export function getAiGenerateBlockReason(
    user: AuthUser | null,
    status: GenerationStatus | null,
    generationsLoading: boolean,
): AiGenerateBlockReason | null {
    if (generationsLoading) {
        return null;
    }
    if (!user) {
        return "sign_in";
    }
    if (!status) {
        return null;
    }
    if (status.plan !== "creator_ai") {
        return "needs_creator_ai";
    }
    if (status.remaining <= 0) {
        return "limit";
    }
    return null;
}
