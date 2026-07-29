import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/get-session-user";
import { hasActiveMotionflowSubscription } from "@/lib/subscriptions";

export const SUBSCRIPTION_REQUIRED_CODE = "SUBSCRIPTION_REQUIRED" as const;
export const UNAUTHORIZED_CODE = "UNAUTHORIZED" as const;

export type CaptionsIdentityInput = {
  email?: string | null;
  userId?: string | null;
};

export type ResolvedCaptionsUser = {
  /** Numeric DB id for real sessions; string for CEP local-dev admin. */
  id: number | string;
  email: string;
  name: string;
  source: "session" | "cep-dev";
  /** When true, skip DB subscription lookup (CEP local-dev admin). */
  treatAsSubscribed: boolean;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** CEP panel local-dev credentials (disabled in production). */
function getCepDevAdmin(): { email: string; id: string } | null {
  if (isProduction()) return null;
  const email = (
    process.env.CEP_DEV_ADMIN_EMAIL ?? "admin@mail.ru"
  )
    .trim()
    .toLowerCase();
  const id = (process.env.CEP_DEV_ADMIN_ID ?? "dev-admin").trim();
  if (!email && !id) return null;
  return { email, id };
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  return t || null;
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const t = String(value).trim();
  return t || null;
}

/**
 * Resolve caller for captions CEP / web:
 * 1) Motion Flow session cookie
 * 2) Non-production CEP body identity (`email` / `userId` matching CEP_DEV_ADMIN_*)
 */
export async function resolveCaptionsUser(
  identity: CaptionsIdentityInput = {},
): Promise<ResolvedCaptionsUser | null> {
  const session = await getSessionUser();
  if (session) {
    return fromSession(session);
  }

  const dev = getCepDevAdmin();
  if (!dev) return null;

  const email = normalizeEmail(identity.email);
  const userId = normalizeId(identity.userId);

  const emailOk = Boolean(email && email === dev.email);
  const idOk = Boolean(userId && userId === dev.id);
  if (!emailOk && !idOk) return null;

  return {
    id: dev.id,
    email: dev.email,
    name: "Admin (dev)",
    source: "cep-dev",
    treatAsSubscribed: true,
  };
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
