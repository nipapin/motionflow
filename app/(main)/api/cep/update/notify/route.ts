import { NextRequest, NextResponse } from "next/server";
import {
  bearerFromRequest,
  requireCaptionsAuth,
} from "@/lib/auth/resolve-captions-user";
import { publishCepExtensionUpdate } from "@/lib/cep-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * POST /api/cep/update/notify — proxy a Spunkram release into Redis `cep:extension`.
 * Auth: CEP Bearer (`mfcep_…`) or Motionflow session. No shared secret — CEP cannot hide one.
 *
 * Body JSON (camelCase or snake_case):
 * - version (required)
 * - zxpUrl / zxp_url (required)
 * - channel: "stable" | "beta" (default from version)
 * - changelog?
 * - publishedAt / published_at?
 */
export async function POST(req: NextRequest) {
  const auth = await requireCaptionsAuth({ bearer: bearerFromRequest(req) });
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const version = asString(body.version);
  const zxpUrl = asString(body.zxpUrl) || asString(body.zxp_url);
  if (!version || !zxpUrl) {
    return NextResponse.json(
      { error: "version and zxpUrl are required" },
      { status: 400 },
    );
  }

  const rawChannel = asString(body.channel).toLowerCase();
  const channel: "stable" | "beta" =
    rawChannel === "stable" || rawChannel === "beta"
      ? rawChannel
      : /-beta/i.test(version)
        ? "beta"
        : "stable";

  const publishedAt =
    asString(body.publishedAt) ||
    asString(body.published_at) ||
    new Date().toISOString();

  const ok = await publishCepExtensionUpdate({
    version,
    zxp_url: zxpUrl,
    changelog: asString(body.changelog),
    channel,
    published_at: publishedAt,
  });

  if (!ok) {
    return NextResponse.json({ error: "Redis publish failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    version,
    channel,
    notifiedBy: auth.user.email,
  });
}
