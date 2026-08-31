import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { mailSiteOriginFromHeaders } from "@/lib/mail/public-origin";
import {
  applyAuthorAccessGrant,
  type AdminGrantDuration,
  type AdminSubscriptionGrant,
} from "@/lib/admin-author-grants";
import { PREMIERE_GAL_AUTHOR_ID } from "@/lib/premiere-gal-paddle-config";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSubscription(
  authorId: number,
  raw: unknown,
): AdminSubscriptionGrant | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;

  if (authorId === SPUNKRAM_AUTHOR_ID) {
    const tier = body.tier === "ai_toolkit" ? "ai_toolkit" : body.tier === "library" ? "library" : null;
    if (!tier) return null;
    const durationRaw = String(body.duration ?? "until_revoked");
    const duration: AdminGrantDuration =
      durationRaw === "1_month" || durationRaw === "1_year"
        ? durationRaw
        : "until_revoked";
    return { kind: "spunkram", tier, duration };
  }

  if (authorId === PREMIERE_GAL_AUTHOR_ID) {
    const planRaw = String(body.plan ?? "lifetime");
    const plan =
      planRaw === "monthly" || planRaw === "yearly" || planRaw === "lifetime"
        ? planRaw
        : "lifetime";
    return { kind: "premiere_gal", plan };
  }

  return null;
}

/**
 * POST /api/extensions/[authorId]/access
 * Packages-admin: grant subscription and/or packs; create+invite user if needed.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  const session = await getSessionUser();
  if (!session || !isPackagesAdmin(session.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const authorId = Number((await ctx.params).authorId);
  if (!Number.isFinite(authorId) || authorId <= 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!(await getPackagesAuthorById(authorId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "BAD_BODY" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const email = typeof data.email === "string" ? data.email.trim() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
  }

  const createIfMissing = data.createIfMissing !== false;
  const revokeSubscription = data.revokeSubscription === true;
  const subscription = revokeSubscription
    ? null
    : parseSubscription(authorId, data.subscription);

  const packIds = Array.isArray(data.packIds)
    ? data.packIds
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];
  const revokePackIds = Array.isArray(data.revokePackIds)
    ? data.revokePackIds
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];

  if (
    !revokeSubscription &&
    !subscription &&
    packIds.length === 0 &&
    revokePackIds.length === 0
  ) {
    return NextResponse.json(
      { error: "NOTHING_TO_GRANT", message: "Choose a subscription or packs." },
      { status: 400 },
    );
  }

  try {
    const result = await applyAuthorAccessGrant({
      authorId,
      email,
      createIfMissing,
      subscription,
      revokeSubscription,
      packIds,
      revokePackIds,
      siteOrigin: mailSiteOriginFromHeaders(req.headers),
    });
    return NextResponse.json({
      ok: true,
      user_id: result.userId,
      email: result.email,
      name: result.name,
      created: result.created,
      invited: result.invited,
      access: result.snapshot,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "SERVER_ERROR";
    if (message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    }
    if (message === "INVALID_EMAIL") {
      return NextResponse.json({ error: "BAD_EMAIL" }, { status: 400 });
    }
    if (message === "BAD_GRANT_AUTHOR") {
      return NextResponse.json({ error: "BAD_GRANT_AUTHOR" }, { status: 400 });
    }
    console.error("[extensions/access POST]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
