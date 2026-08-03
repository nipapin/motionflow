import { NextRequest, NextResponse } from "next/server";
import { adminApplyCreditChanges } from "@/lib/user-generation-credits";

export const runtime = "nodejs";

/**
 * Owner / ops: adjust `user_generation_credits` (SSOT) scoped by author_id.
 * Motionflow (authorId=0, default) also mirrors `users.extra_generations_count`.
 *
 * Header: `x-motionflow-admin-secret: ${MOTIONFLOW_ADMIN_API_SECRET}`
 *
 * Body JSON:
 * - `userId` (required)
 * - `authorId` (optional, default 0 = Motionflow; Spunkram = 1691)
 * - `setExtraBalance` (optional absolute int)
 * - `subscriptionAdjustment` (optional int — always adds to plan limit from SSOT row)
 * - `note` (optional audit note)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MOTIONFLOW_ADMIN_API_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "MOTIONFLOW_ADMIN_API_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (req.headers.get("x-motionflow-admin-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: unknown;
    authorId?: unknown;
    setExtraBalance?: unknown;
    subscriptionAdjustment?: unknown;
    note?: unknown;
  } | null;

  const userId = Number(body?.userId);
  if (!body || !Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json(
      { error: "userId must be a positive integer" },
      { status: 400 },
    );
  }

  let authorId = 0;
  if (body.authorId !== undefined && body.authorId !== null) {
    authorId = Number(body.authorId);
    if (!Number.isFinite(authorId) || authorId < 0) {
      return NextResponse.json(
        { error: "authorId must be a non-negative integer" },
        { status: 400 },
      );
    }
  }

  const hasExtra =
    body.setExtraBalance !== undefined && body.setExtraBalance !== null;
  const hasSub =
    body.subscriptionAdjustment !== undefined &&
    body.subscriptionAdjustment !== null;
  if (!hasExtra && !hasSub) {
    return NextResponse.json(
      {
        error: "Provide setExtraBalance and/or subscriptionAdjustment",
      },
      { status: 400 },
    );
  }

  const result = await adminApplyCreditChanges({
    userId,
    authorId,
    setExtraBalance: hasExtra ? Number(body.setExtraBalance) : undefined,
    subscriptionAdjustment: hasSub
      ? Number(body.subscriptionAdjustment)
      : undefined,
    note:
      typeof body.note === "string" && body.note.trim() !== ""
        ? body.note.trim()
        : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, authorId });
}
