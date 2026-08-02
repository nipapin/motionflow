import { NextRequest, NextResponse } from "next/server";
import {
  bearerFromRequest,
  identityFromFormData,
  identityFromJsonBody,
  resolveCaptionsUser,
  type CaptionsIdentityInput,
  UNAUTHORIZED_CODE,
} from "@/lib/auth/resolve-captions-user";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import {
  CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT,
  getCepSpunkramGenerationsStatus,
  getGenerationsStatus,
  type GenerationStatus,
} from "@/lib/generations";

export const runtime = "nodejs";

/** Unlimited placeholder for CEP local-dev admin (no numeric user id). */
function devUnlimitedStatus(): GenerationStatus {
  return {
    used: 0,
    limit: CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT,
    effective_limit: CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT,
    remaining: CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT,
    hasSubscription: true,
    plan: "creator_ai",
    subscription_generations_left: CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT,
    extra_generations_left: 0,
    total_generations_left: CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT,
  };
}

async function readIdentity(req: NextRequest): Promise<CaptionsIdentityInput> {
  const bearer = bearerFromRequest(req);
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    return form ? { ...identityFromFormData(form), bearer } : { bearer };
  }
  if (req.method === "GET") {
    const { searchParams } = new URL(req.url);
    return {
      email: searchParams.get("email"),
      userId: searchParams.get("userId"),
      devToken: searchParams.get("devToken"),
      bearer,
    };
  }
  const body = await req.json().catch(() => null);
  return { ...identityFromJsonBody(body), bearer };
}

async function handleStatus(req: NextRequest) {
  try {
    const identity = await readIdentity(req);
    const user = await resolveCaptionsUser(identity);
    if (!user) {
      return NextResponse.json(
        { authenticated: false, code: UNAUTHORIZED_CODE },
        { status: 401 },
      );
    }

    if (typeof user.id !== "number") {
      return NextResponse.json({
        authenticated: true,
        source: user.source,
        ...devUnlimitedStatus(),
      });
    }

    // CEP Bearer → Spunkram author tier (10 free / 100 subscribed), not Creator + AI.
    const cepUser = identity.bearer
      ? await resolveCepBearerUser(identity.bearer)
      : null;
    if (cepUser) {
      const cfg =
        getCepClientConfig(cepUser.client) ??
        requireCepClientConfig("spunkram-cep");
      const authorSub = await getActiveAuthorSubscription(
        cepUser.id,
        cfg.authorId,
      );
      const status = await getCepSpunkramGenerationsStatus(
        cepUser.id,
        {
          free: cfg.freeGenerationsLimit,
          subscribed: cfg.subscribedGenerationsLimit,
        },
        authorSub.active,
      );
      return NextResponse.json({
        authenticated: true,
        source: "cep-bearer",
        ...status,
        plan: authorSub.active ? "spunkram_subscribed" : "free",
      });
    }

    const status = await getGenerationsStatus(user.id);
    return NextResponse.json({
      authenticated: true,
      source: user.source,
      ...status,
    });
  } catch (err) {
    console.error("[cep/generations]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load generations" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleStatus(req);
}

export async function POST(req: NextRequest) {
  return handleStatus(req);
}
