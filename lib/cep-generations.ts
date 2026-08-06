import "server-only";
import { NextResponse } from "next/server";
import type { ResolvedCaptionsUser } from "@/lib/auth/resolve-captions-user";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import {
  cepAiGenerationsLimit,
  getActiveAuthorSubscription,
} from "@/lib/cep-entitlements";
import {
  consumeCepSpunkramGeneration,
  consumeGeneration,
  getCepSpunkramGenerationsStatus,
  getGenerationsStatus,
  type ConsumeResult,
  type GenerationStatus,
  type GenerationTool,
} from "@/lib/generations";

export const BILLABLE_ACCOUNT_REQUIRED_CODE = "BILLABLE_ACCOUNT_REQUIRED" as const;

function emptyStatus(): GenerationStatus {
  return {
    used: 0,
    limit: 0,
    effective_limit: 0,
    remaining: 0,
    hasSubscription: false,
    plan: "none",
    subscription_generations_left: 0,
    extra_generations_left: 0,
    total_generations_left: 0,
  };
}

/** Real DB user id — required for any metered CEP AI call. */
export function isBillableCepUser(
  user: ResolvedCaptionsUser,
): user is ResolvedCaptionsUser & { id: number } {
  return typeof user.id === "number";
}

export function billableAccountRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      code: BILLABLE_ACCOUNT_REQUIRED_CODE,
      error: "BILLABLE_ACCOUNT_REQUIRED",
      message: "Sign in with a Motionflow account to use AI generations.",
      ...emptyStatus(),
    },
    { status: 403 },
  );
}

async function cepQuota(user: ResolvedCaptionsUser & { id: number }) {
  const cfg =
    getCepClientConfig(user.cepClient || "spunkram-cep") ??
    requireCepClientConfig("spunkram-cep");
  const sub = await getActiveAuthorSubscription(user.id, cfg.authorId);
  return {
    cfg,
    authorId: cfg.authorId,
    authorSubscribed: sub.active,
    monthlyLimit: cepAiGenerationsLimit(cfg, sub),
  };
}

/** Status for captions/chapters/voiceover — Spunkram CEP uses author-tier limits. */
export async function generationsStatusForResolvedUser(
  user: ResolvedCaptionsUser,
): Promise<GenerationStatus> {
  // Non-numeric ids are never billable — report zero so clients cannot
  // treat them as unlimited.
  if (!isBillableCepUser(user)) return emptyStatus();

  if (user.source === "cep-bearer") {
    const { monthlyLimit, authorSubscribed, authorId } = await cepQuota(user);
    return getCepSpunkramGenerationsStatus(
      user.id,
      monthlyLimit,
      authorSubscribed,
      authorId,
    );
  }
  return getGenerationsStatus(user.id);
}

/**
 * Atomically consume 1 generation. Non-billable identities always fail
 * (no silent unlimited path).
 */
export async function consumeGenerationForResolvedUser(
  user: ResolvedCaptionsUser,
  tool: GenerationTool,
): Promise<ConsumeResult> {
  if (!isBillableCepUser(user)) {
    return { ok: false, reason: "limit_reached", status: emptyStatus() };
  }
  if (user.source === "cep-bearer") {
    const { monthlyLimit, authorSubscribed, authorId } = await cepQuota(user);
    return consumeCepSpunkramGeneration(
      user.id,
      tool,
      monthlyLimit,
      authorSubscribed,
      authorId,
    );
  }
  return consumeGeneration(user.id, tool);
}
