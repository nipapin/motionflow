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
  /** Secret shared with non-distributed CEP dev builds — required to use dev-admin in production. */
  devToken?: string | null;
  /** Raw `Authorization` header — CEP panels send `Bearer mfcep_…` device tokens. */
  bearer?: string | null;
};

export type ResolvedCaptionsUser = {
  /** Numeric DB id for real sessions; string for CEP local-dev admin. */
  id: number | string;
  email: string;
  name: string;
  source: "session" | "cep-dev" | "cep-bearer";
  /** When true, skip DB subscription lookup (CEP local-dev admin). */
  treatAsSubscribed: boolean;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** CEP panel local-dev credentials. In production, also requires a matching `devToken` (see `isDevTokenValid`). */
function getCepDevAdmin(): { email: string; id: string } | null {
  const email = (
    process.env.CEP_DEV_ADMIN_EMAIL ?? "admin@mail.ru"
  )
    .trim()
    .toLowerCase();
  const id = (process.env.CEP_DEV_ADMIN_ID ?? "dev-admin").trim();
  if (!email && !id) return null;
  return { email, id };
}

/**
 * Production gate for CEP dev-admin: requires `CEP_DEV_ADMIN_TOKEN` to be
 * configured *and* matched by the caller's `devToken`. The token is only
 * ever embedded in non-distributed CEP builds (`npm run watch` / `build`,
 * never `zxp` / `zip` — see `vite.config.ts`), so it never reaches real
 * users while still letting the developer exercise AI tools against prod.
 */
function isDevTokenValid(token: string | null | undefined): boolean {
  const expected = process.env.CEP_DEV_ADMIN_TOKEN?.trim();
  if (!expected) return false;
  return typeof token === "string" && token.trim() === expected;
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
 * 1) CEP Bearer device token (`Authorization: Bearer mfcep_…`, see lib/cep-auth.ts)
 * 2) Motion Flow session cookie
 * 3) CEP body identity matching CEP_DEV_ADMIN_* — in production also requires
 *    a valid `devToken` (see `isDevTokenValid`), always available outside prod.
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
        treatAsSubscribed: false,
      };
    }
  }

  const session = await getSessionUser();
  if (session) {
    return fromSession(session);
  }

  const dev = getCepDevAdmin();
  if (!dev) return null;

  if (isProduction() && !isDevTokenValid(identity.devToken)) return null;

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

  const devToken =
    typeof b.devToken === "string"
      ? b.devToken
      : typeof user?.devToken === "string"
        ? user.devToken
        : null;

  return { email, userId, devToken };
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
  const devTokenRaw = form.get("devToken");
  return {
    email: typeof emailRaw === "string" ? emailRaw : null,
    userId: typeof userIdRaw === "string" ? userIdRaw : null,
    devToken: typeof devTokenRaw === "string" ? devTokenRaw : null,
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
