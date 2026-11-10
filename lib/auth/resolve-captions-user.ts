import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/get-session-user";
import { hasActiveMotionflowSubscription } from "@/lib/subscriptions";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { resolveOdinAiUser, type OdinAiUser } from "@/lib/odin-ai";
import type { CaptionsBrand } from "@/lib/captions-catalog";

export const SUBSCRIPTION_REQUIRED_CODE = "SUBSCRIPTION_REQUIRED" as const;
export const UNAUTHORIZED_CODE = "UNAUTHORIZED" as const;

export type CaptionsIdentityInput = {
  email?: string | null;
  userId?: string | null;
  /** Raw `Authorization` header — Motionflow or Odin CEP device tokens. */
  bearer?: string | null;
};

export type ResolvedCaptionsUser = OdinAiUser | {
  /** Numeric DB id for real sessions; string only if a legacy path remains. */
  id: number | string;
  email: string;
  name: string;
  source: "session" | "cep-bearer";
  /**
   * @deprecated Ignored for entitlements. Kept for type compat with older callers.
   * Use {@link userCanDownloadCaptionProject} / billable generation checks instead.
   */
  treatAsSubscribed: boolean;
  /** Present for CEP device tokens — used for Spunkram entitlements. */
  cepClient?: string;
};

/**
 * Resolve caller for captions CEP / web:
 * 1) Verified Odin or Motionflow CEP Bearer device token
 * 2) Motion Flow session cookie
 *
 * Body email/userId are NOT trusted for identity.
 */
export async function resolveCaptionsUser(
  identity: CaptionsIdentityInput = {},
): Promise<ResolvedCaptionsUser | null> {
  if (identity.bearer) {
    // Invalid/revoked Odin tokens must never fall back to a Motionflow cookie.
    if (identity.bearer.startsWith("Bearer odincep_")) return resolveOdinAiUser(identity.bearer);
    const bearerUser = await resolveCepBearerUser(identity.bearer);
    if (bearerUser) {
      return {
        id: bearerUser.id,
        email: bearerUser.email,
        name: bearerUser.name,
        source: "cep-bearer",
        treatAsSubscribed: false,
        cepClient: bearerUser.client,
      };
    }
    return null;
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

/** Auth only — enough for metered AI generations (credits still required). */
export async function requireCaptionsAuth(
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
  return { ok: true, user };
}

/**
 * Style project download entitlement:
 * - CEP Bearer → active Spunkram (author) subscription
 * - Web session → active Motionflow Creator subscription
 */
export async function userCanDownloadCaptionProject(
  user: ResolvedCaptionsUser,
  brand?: CaptionsBrand,
): Promise<boolean> {
  if (user.source === "odin-bearer") {
    return (!brand || brand === "odin") && user.odinSubscriptionActive && (!user.odinSubscriptionExpiresAt ||
      Date.parse(user.odinSubscriptionExpiresAt) > Date.now());
  }
  if (typeof user.id !== "number") return false;
  if (brand === "odin") return false;

  if (user.source === "cep-bearer") {
    const cfg = getCepClientConfig(user.cepClient || "");
    if (!cfg) return false;
    // Preserve the existing Motionflow web/platform Gal caption catalog. Author
    // tokens are additionally restricted to their own server-registered brand.
    if (cfg.platformSubscription) return (!brand || brand === "gal") && hasActiveMotionflowSubscription(user.id);
    const target = getCepClientConfig(brand === "gal" ? "gal-cep" : brand === "spunkram" ? "spunkram-cep" : cfg.client);
    if (!target || target.authorId !== cfg.authorId) return false;
    const sub = await getActiveAuthorSubscription(user.id, cfg.authorId);
    return sub.active;
  }

  const target = requireCepClientConfig(brand === "spunkram" ? "spunkram-cep" : "gal-cep");
  const sub = await getActiveAuthorSubscription(user.id, target.authorId);
  return sub.active || ((!brand || brand === "gal") && await hasActiveMotionflowSubscription(user.id));
}

/**
 * Auth + subscription gate for caption style downloads (mogrt/aep/definition).
 */
export async function requireCaptionsAccess(
  identity: CaptionsIdentityInput = {},
  brand?: CaptionsBrand,
): Promise<
  | { ok: true; user: ResolvedCaptionsUser }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireCaptionsAuth(identity);
  if (!auth.ok) return auth;

  const allowed = await userCanDownloadCaptionProject(auth.user, brand);
  if (!allowed) {
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

  return { ok: true, user: auth.user };
}

/** @deprecated Use {@link userCanDownloadCaptionProject}. */
export async function userHasCaptionsSubscription(
  user: ResolvedCaptionsUser,
): Promise<boolean> {
  return userCanDownloadCaptionProject(user);
}
