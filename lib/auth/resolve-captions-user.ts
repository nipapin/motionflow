import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/get-session-user";
import { hasActiveMotionflowSubscription } from "@/lib/subscriptions";
import { resolveCepBearerUser } from "@/lib/cep-auth";

export const SUBSCRIPTION_REQUIRED_CODE = "SUBSCRIPTION_REQUIRED" as const;
export const UNAUTHORIZED_CODE = "UNAUTHORIZED" as const;

export type CaptionsIdentityInput = {
  email?: string | null;
  userId?: string | null;
  /** Raw `Authorization` header — CEP panels send `Bearer mfcep_…` device tokens. */
  bearer?: string | null;
};

export type ResolvedCaptionsUser = {
  /** Numeric DB id for real sessions; string only if a legacy path remains. */
  id: number | string;
  email: string;
  name: string;
  source: "session" | "cep-bearer";
  /** When true, skip DB subscription lookup. */
  treatAsSubscribed: boolean;
  /** Present for CEP device tokens — used for Spunkram entitlements. */
  cepClient?: string;
};

/**
 * Resolve caller for captions CEP / web:
 * 1) CEP Bearer device token (`Authorization: Bearer mfcep_…`, see lib/cep-auth.ts)
 * 2) Motion Flow session cookie
 */
export async function resolveCaptionsUser(
  identity: CaptionsIdentityInput = {},
): Promise<ResolvedCaptionsUser | null> {
  if (identity.bearer) {
    const bearerUser = await resolveCepBearerUser(identity.bearer);
    if (bearerUser) {
      return {
        id: bearerUser.id,
        email: bearerUser.email,
        name: bearerUser.name,
        source: "cep-bearer",
        // Free CEP tier includes limited AI gens — don't require Motionflow Creator.
        treatAsSubscribed: true,
        cepClient: bearerUser.client,
      };
    }
  }

  const session = await getSessionUser();
  if (session) {
    return fromSession(session);
  }

  return null;
}

function fromSession(session: SessionUser): ResolvedCaptionsUser {
  return {
    id: session.id,
    email: session.email,
    name: session.name,
    source: "session",
    treatAsSubscribed: false,
  };
}

/** Parse `user` / top-level fields from JSON body (POST /api/captions). */
export function identityFromJsonBody(body: unknown): CaptionsIdentityInput {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const user =
    b.user && typeof b.user === "object"
      ? (b.user as Record<string, unknown>)
      : null;

  const email =
    typeof b.email === "string"
      ? b.email
      : typeof user?.email === "string"
        ? user.email
        : null;

  // Prefer explicit userId / user.id — never confuse with caption `id`
  const userId =
    typeof b.userId === "string" || typeof b.userId === "number"
      ? String(b.userId)
      : typeof user?.id === "string" || typeof user?.id === "number"
        ? String(user.id)
        : null;

  return { email, userId };
}

/** Authorization header for CEP Bearer auth (pass alongside body/form identity). */
export function bearerFromRequest(req: {
  headers: { get(name: string): string | null };
}): string | null {
  return req.headers.get("authorization");
}

/** Parse form fields from multipart (POST /api/generations/captions). */
export function identityFromFormData(form: FormData): CaptionsIdentityInput {
  const emailRaw = form.get("email");
  const userIdRaw = form.get("userId");
  return {
    email: typeof emailRaw === "string" ? emailRaw : null,
    userId: typeof userIdRaw === "string" ? userIdRaw : null,
  };
}

export async function userHasCaptionsSubscription(
  user: ResolvedCaptionsUser,
): Promise<boolean> {
  if (user.treatAsSubscribed) return true;
  if (typeof user.id !== "number") return false;
  return hasActiveMotionflowSubscription(user.id);
}

/**
 * Auth + subscription gate for captions download / transcribe.
 * Returns 401 / 403 NextResponse on failure.
 */
export async function requireCaptionsAccess(
  identity: CaptionsIdentityInput = {},
): Promise<
  | { ok: true; user: ResolvedCaptionsUser }
  | { ok: false; response: NextResponse }
> {
  const user = await resolveCaptionsUser(identity);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized", code: UNAUTHORIZED_CODE },
        { status: 401 },
      ),
    };
  }

  const subscribed = await userHasCaptionsSubscription(user);
  if (!subscribed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Active subscription required.",
          code: SUBSCRIPTION_REQUIRED_CODE,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, user };
}
