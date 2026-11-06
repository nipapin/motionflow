import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { getCepClientByAuthorId, ODIN_CEP_CLIENT } from "@/lib/cep-client-registry";
import { getPool } from "@/lib/db";
import { ensurePackagesProjectsTable } from "@/lib/packages-authors-db";
import { AuthorCreditGrantError } from "@/lib/admin-author-generation-credits";
import { applyAuthorCreditBatch, previewAuthorCreditBatch } from "@/lib/author-bulk-generation-credits";
import { isTableQueryError } from "@/lib/table-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
type Context = { params: Promise<{ authorId: string }> };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

async function authorize(context: Context) {
  const admin = await getSessionUser();
  if (!admin || !isPackagesAdmin(admin.email)) throw new AuthorCreditGrantError("FORBIDDEN", 403);
  const value = (await context.params).authorId;
  const authorId = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(authorId) || !await getPackagesAuthorById(authorId)) throw new AuthorCreditGrantError("NOT_FOUND", 404);
  const cfg = getCepClientByAuthorId(authorId);
  if (!cfg || cfg.platformSubscription || cfg.client === ODIN_CEP_CLIENT) throw new AuthorCreditGrantError("AUTHOR_CREDITS_UNAVAILABLE", 404);
  return { admin, authorId, cfg };
}
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  if (origin === req.nextUrl.origin) return true;
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!host || !["http", "https"].includes(protocol || "")) return false;
  try { return origin === new URL(`${protocol}://${host}`).origin; } catch { return false; }
}
function fail(error: unknown) {
  if (error instanceof AuthorCreditGrantError) return reply({ error: error.code }, error.status);
  if (isTableQueryError(error)) return reply({ error: "INVALID_FILTERS" }, 400);
  console.error("[extensions/bulk-generation-credits] Request failed; grants can be retried with the same batch ID");
  return reply({ error: "BATCH_FAILED" }, 503);
}
export async function GET(_req: NextRequest, context: Context) {
  try {
    const { authorId, cfg } = await authorize(context);
    await ensurePackagesProjectsTable();
    const [packs] = await getPool().execute<RowDataPacket[]>(
      `SELECT id, name, host FROM packages_projects WHERE author_id = ?
       AND deleted_at IS NULL AND COALESCE(admin_only, 0) = 0 AND price > 0 ORDER BY name, host`, [authorId]);
    return reply({ extensionName: cfg.extensionName, packs });
  } catch (error) { return fail(error); }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    const { admin, authorId } = await authorize(context);
    if (!sameOrigin(req)) throw new AuthorCreditGrantError("FORBIDDEN", 403);
    const body = await req.json().catch(() => null);
    if (body?.action === "apply" && typeof body.batchId === "string") {
      return reply(await applyAuthorCreditBatch(authorId, admin.id, body.batchId));
    }
    if (body?.action !== "preview" || typeof body.query !== "string" || typeof body.note !== "string"
      || !Array.isArray(body.packIds)) throw new AuthorCreditGrantError("INVALID_GRANT", 400);
    return reply(await previewAuthorCreditBatch({ authorId, adminUserId: admin.id,
      amount: body.amount, note: body.note, query: body.query, packIds: body.packIds }));
  } catch (error) { return fail(error); }
}
