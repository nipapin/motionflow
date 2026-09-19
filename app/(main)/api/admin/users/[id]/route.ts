import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import {
  AdminUserConflictError,
  getAdminUserById,
  updateAdminUser,
} from "@/lib/admin-users";
import {
  listAdminUserPurchases,
  listAdminUserSubscriptions,
} from "@/lib/admin-user-grants";
import { adminUserPatchSchema } from "@/lib/validations/admin-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!isAffiliateAdmin(session)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  try {
    const user = await getAdminUserById(id);
    if (!user) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const [purchases, subscriptions] = await Promise.all([
      listAdminUserPurchases(id),
      listAdminUserSubscriptions(id),
    ]);
    return NextResponse.json({ user, purchases, subscriptions });
  } catch (err) {
    console.error("[admin/users GET id]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session || !isAffiliateAdmin(session)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = adminUserPatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_FAILED", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const existing = await getAdminUserById(id);
    if (!existing) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const user = await updateAdminUser(id, parsed.data, { adminUserId: session.id });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    if (err instanceof AdminUserConflictError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 409 },
      );
    }
    console.error("[admin/users PATCH]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
