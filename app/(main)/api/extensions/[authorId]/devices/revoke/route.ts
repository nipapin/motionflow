import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { adminRevokeExtensionDevice } from "@/lib/cep-extension-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/extensions/[authorId]/devices/revoke
 * Packages-admin only. Body: { device_id: "dev_…" }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const authorId = Number((await ctx.params).authorId);
  if (!Number.isFinite(authorId) || authorId <= 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!(await getPackagesAuthorById(authorId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let body: { device_id?: unknown };
  try {
    body = (await req.json()) as { device_id?: unknown };
  } catch {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "Expected JSON body" },
      { status: 400 },
    );
  }

  try {
    const result = await adminRevokeExtensionDevice({
      authorId,
      deviceIdRaw: body.device_id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[extensions/devices/revoke]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
