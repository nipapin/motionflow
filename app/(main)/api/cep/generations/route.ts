import { NextRequest, NextResponse } from "next/server";
import {
  bearerFromRequest,
  identityFromFormData,
  identityFromJsonBody,
  resolveCaptionsUser,
  type CaptionsIdentityInput,
  UNAUTHORIZED_CODE,
} from "@/lib/auth/resolve-captions-user";
import {
  CREATOR_AI_BILLING_PERIOD_GENERATIONS_LIMIT,
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

    const status = await getGenerationsStatus(user.id);
    return NextResponse.json({
      authenticated: true,
      source: user.source,
      ...status,
    });
  } catch (err) {
    console.error("[cep/generations]", err);
    return NextResponse.json(
      { error: "Failed to load generation status" },
      { status: 500 },
    );
  }
}

/**
 * CEP-reachable generations status.
 * Auth: same as captions — session cookie, or non-prod CEP body/query identity.
 */
export async function GET(req: NextRequest) {
  return handleStatus(req);
}

/** Same as GET — CEP may POST with email/userId in JSON body. */
export async function POST(req: NextRequest) {
  return handleStatus(req);
}
