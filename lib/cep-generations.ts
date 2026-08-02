import "server-only";
import type { ResolvedCaptionsUser } from "@/lib/auth/resolve-captions-user";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import {
  consumeCepSpunkramGeneration,
  consumeGeneration,
  getCepSpunkramGenerationsStatus,
  getGenerationsStatus,
  type ConsumeResult,
  type GenerationStatus,
  type GenerationTool,
} from "@/lib/generations";

async function cepLimits(user: ResolvedCaptionsUser) {
  const cfg =
    getCepClientConfig(user.cepClient || "spunkram-cep") ??
    requireCepClientConfig("spunkram-cep");
  if (typeof user.id !== "number") {
    return { cfg, authorSubscribed: true as boolean };
  }
  const sub = await getActiveAuthorSubscription(user.id, cfg.authorId);
  return { cfg, authorSubscribed: sub.active };
}

/** Status for captions/chapters/voiceover — Spunkram CEP uses author-tier limits. */
export async function generationsStatusForResolvedUser(
  user: ResolvedCaptionsUser,
): Promise<GenerationStatus> {
  if (typeof user.id !== "number") {
    return {
      used: 0,
      limit: 100,
      effective_limit: 100,
      remaining: 100,
      hasSubscription: true,
      plan: "creator_ai",
      subscription_generations_left: 100,
      extra_generations_left: 0,
      total_generations_left: 100,
    };
  }
  if (user.source === "cep-bearer") {
    const { cfg, authorSubscribed } = await cepLimits(user);
    return getCepSpunkramGenerationsStatus(
      user.id,
      {
        free: cfg.freeGenerationsLimit,
        subscribed: cfg.subscribedGenerationsLimit,
      },
      authorSubscribed,
    );
  }
  return getGenerationsStatus(user.id);
}

export async function consumeGenerationForResolvedUser(
  user: ResolvedCaptionsUser,
  tool: GenerationTool,
): Promise<ConsumeResult> {
  if (typeof user.id !== "number") {
    return {
      ok: true,
      status: await generationsStatusForResolvedUser(user),
    };
  }
  if (user.source === "cep-bearer") {
    const { cfg, authorSubscribed } = await cepLimits(user);
    return consumeCepSpunkramGeneration(
      user.id,
      tool,
      {
        free: cfg.freeGenerationsLimit,
        subscribed: cfg.subscribedGenerationsLimit,
      },
      authorSubscribed,
    );
  }
  return consumeGeneration(user.id, tool);
}
