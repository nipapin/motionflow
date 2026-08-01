import { NextRequest, NextResponse } from "next/server";
import { listDevicesForUser, resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getActiveSubscriptionForUser,
  type ActiveSubscriptionSummary,
} from "@/lib/subscriptions";

export const runtime = "nodejs";

/**
 * GET /api/cep/me — profile + subscription + devices for the CEP panel.
 * Auth: `Authorization: Bearer mfcep_…` only (401 → panel signs the user out).
 * @see CEP/spunkram-library/docs/BACKEND_CEP_API.md §1.4
 */
export async function GET(req: NextRequest) {
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or revoked token" },
        { status: 401 },
      );
    }

    const [subscription, devices] = await Promise.all([
      getActiveSubscriptionForUser(user.id),
      listDevicesForUser(user.id, user.deviceId),
    ]);

    return NextResponse.json({
      user: {
        id: `user_${user.id}`,
        email: user.email,
        name: user.name || undefined,
      },
      subscription: subscriptionPayload(subscription),
      devices,
    });
  } catch (err) {
    console.error("[cep/me]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not load profile" },
      { status: 500 },
    );
  }
}

function subscriptionPayload(sub: ActiveSubscriptionSummary | null): {
  active: boolean;
  plan?: string;
  status?: string;
  renews_at?: string;
} {
  if (!sub) {
    return { active: false, status: "none" };
  }
  return {
    active: true,
    plan: sub.tier === "creator_ai" ? "Creator + AI" : "Creator",
    status: sub.cancelled ? "cancelled" : "active",
    renews_at: toIsoDate(sub.currentPeriodEnd),
  };
}

/** DB DATETIME comes back as a Date or "YYYY-MM-DD HH:MM:SS" string (UTC). */
function toIsoDate(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  if (!s) return undefined;
  const d = new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
