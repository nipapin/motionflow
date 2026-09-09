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

function adminSecretFromRequest(req: NextRequest): string | null {
  const header = req.headers.get("x-motionflow-admin-secret")?.trim();
  return header || null;
}

function adminSecretMatches(got: string | null): boolean {
  const expected = process.env.MOTIONFLOW_ADMIN_API_SECRET?.trim();
  return Boolean(expected && got && got === expected);
}

/**
 * POST /api/cep/update/notify — proxy a CEP release into Redis `cep:extension`.
 * Auth: `x-motionflow-admin-secret` (same `MOTIONFLOW_ADMIN_API_SECRET` as credits admin),
 * or CEP Bearer / Motionflow session as a leftover fallback.
 *
 * Body JSON (camelCase or snake_case):
 * - version (required)
 * - zxpUrl / zxp_url (required)
 * - channel: "stable" | "beta" (default from version)
 * - product: "spunkram" | "gal" (optional; panels filter by brand)
 * - changelog?
 * - publishedAt / published_at?
 */
export async function POST(req: NextRequest) {
  const viaAdmin = adminSecretMatches(adminSecretFromRequest(req));
  let notifiedBy = "admin";
  if (!viaAdmin) {
    const auth = await requireCaptionsAuth({ bearer: bearerFromRequest(req) });
    if (!auth.ok) return auth.response;
    notifiedBy = auth.user.email;
  }

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

  const rawProduct = asString(body.product).toLowerCase();
  const product: "spunkram" | "gal" | undefined =
    rawProduct === "gal" || rawProduct === "spunkram" ? rawProduct : undefined;

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
    product,
  });

  if (!ok) {
    return NextResponse.json({ error: "Redis publish failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    version,
    channel,
    product: product ?? null,
    notifiedBy,
  });
}
