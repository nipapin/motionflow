import { NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getActiveSubscriptionForUser } from "@/lib/subscriptions";
import { clearScheduledChange, PaddleApiError } from "@/lib/paddle-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/subscription/scheduled-change
 *
 * Drops a previously scheduled downgrade so the current plan keeps renewing
 * normally. Mirrors the "Cancel change" button in the pricing-page banner.
 */
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getActiveSubscriptionForUser(user.id);
  if (!current) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 400 },
    );
  }
  if (!current.scheduledChange) {
    return NextResponse.json({ ok: true, alreadyCleared: true });
  }

  // mysql2 returns DATETIME columns as JS Date objects by default, and
  // `Date.toString()` on Windows / non-English locales includes localized
  // timezone names with non-ASCII characters (e.g. "Восточноевропейское
  // летнее время"). Headers are ByteString-only, so we coerce to a numeric
  // epoch first.
  const effectiveAtKey = (() => {
    const raw = current.scheduledChange.effectiveAt;
    const ms = raw ? new Date(raw as unknown as string).getTime() : NaN;
    return Number.isFinite(ms) ? String(ms) : "unknown";
  })();
  try {
    await clearScheduledChange(current.paddleSubscriptionId, {
      idempotencyKey: `mf_clear_sched_${current.paddleSubscriptionId}_${effectiveAtKey}`,
    });
  } catch (err) {
    if (err instanceof PaddleApiError) {
      console.error("[paddle] clear scheduled change failed:", err.status, err.body);
      return NextResponse.json(
        { error: err.message },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 },
      );
    }
    console.error("[paddle] clear scheduled change unexpected error:", err);
    return NextResponse.json({ error: "Paddle update failed" }, { status: 502 });
  }

  const pool = getPool();
  await pool.execute<ResultSetHeader>(
    `UPDATE \`subscription_systems\`
        SET \`scheduled_change_action\`              = NULL,
            \`scheduled_change_effective_at\`        = NULL,
            \`scheduled_change_paddle_product_id\`   = NULL,
            \`scheduled_change_paddle_price_id\`     = NULL,
            \`scheduled_change_paddle_product_name\` = NULL,
            \`scheduled_change_plan\`                = NULL,
            \`updated_at\`                           = NOW()
      WHERE \`subscription_id\` = ? AND \`buyer_id\` = ?`,
    [current.paddleSubscriptionId, user.id],
  );

  return NextResponse.json({ ok: true });
}
