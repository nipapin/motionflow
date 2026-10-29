import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { getCepClientByAuthorId, ODIN_CEP_CLIENT } from "@/lib/cep-client-registry";
import { getPool } from "@/lib/db";
import { getExtraBalance } from "@/lib/user-generation-credits";
import { addAuthorExtraGenerations, AuthorCreditGrantError } from "@/lib/admin-author-generation-credits";
import type { RowDataPacket } from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ authorId: string; userId: string }> };
const responseHeaders = { "Cache-Control": "private, no-store" };

async function authorize(context: Context) {
  const admin = await getSessionUser();
  if (!admin || !isPackagesAdmin(admin.email)) throw new AuthorCreditGrantError("FORBIDDEN", 403);
  const params = await context.params;
  if (!/^[1-9]\d*$/.test(params.authorId) || !/^[1-9]\d*$/.test(params.userId)) throw new AuthorCreditGrantError("NOT_FOUND", 404);
  const authorId = Number(params.authorId), userId = Number(params.userId);
  if (!Number.isSafeInteger(authorId) || !Number.isSafeInteger(userId) || !await getPackagesAuthorById(authorId)) throw new AuthorCreditGrantError("NOT_FOUND", 404);
  const cfg = getCepClientByAuthorId(authorId);
  // Odin has its own backend ledger; do not create unused local credits for it.
  if (!cfg || cfg.platformSubscription || cfg.client === ODIN_CEP_CLIENT) throw new AuthorCreditGrantError("AUTHOR_CREDITS_UNAVAILABLE", 404);
  return { admin, userId, authorId, extensionName: cfg.extensionName };
}
function fail(error: unknown) {
  if (error instanceof AuthorCreditGrantError) return NextResponse.json({ error: error.code }, { status: error.status, headers: responseHeaders });
  console.error("[extensions/generation-credits] request failed");
  return NextResponse.json({ error: "Could not update generation credits." }, { status: 500, headers: responseHeaders });
}

export async function GET(_req: NextRequest, context: Context) {
  try {
    const { userId, authorId, extensionName } = await authorize(context);
    const [users] = await getPool().execute<RowDataPacket[]>("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
    if (!users.length) throw new AuthorCreditGrantError("USER_NOT_FOUND", 404);
    return NextResponse.json({ authorId, extensionName, extraBalance: await getExtraBalance(userId, authorId) }, { headers: responseHeaders });
  } catch (error) { return fail(error); }
}

export async function POST(req: NextRequest, context: Context) {
  try {
    const { admin, userId, authorId, extensionName } = await authorize(context);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)
      || !Number.isSafeInteger(body.amount) || body.amount < 1 || body.amount > 1_000_000
      || typeof body.requestId !== "string"
      || (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 500))) throw new AuthorCreditGrantError("INVALID_GRANT", 400);
    const result = await addAuthorExtraGenerations({ userId, authorId, adminUserId: admin.id, amount: body.amount, requestId: body.requestId, note: body.note });
    return NextResponse.json({ ok: true, authorId, extensionName, ...result }, { headers: responseHeaders });
  } catch (error) { return fail(error); }
}
