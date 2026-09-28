import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { getPackagesProject } from "@/lib/packages-projects";
import {
  getItemShowcasePrefix,
  normalizeShowcasePrefixInput,
  setItemShowcasePrefix,
} from "@/lib/marketplace-showcase-prefix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ authorId: string; itemId: string }> };

/**
 * Preview assets folder for the marketplace item a CEP pack is linked to.
 * Stored on `marketplace_items`, edited here because published items have no
 * other admin form.
 */
type LinkedItem =
  | { ok: true; marketplaceItemId: number | null }
  | { ok: false; error: "FORBIDDEN" | "NOT_FOUND" };

async function resolveLinkedItem(ctx: RouteCtx): Promise<LinkedItem> {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) return { ok: false, error: "FORBIDDEN" };

  const params = await ctx.params;
  const authorId = Number(params.authorId);
  const packId = Number(params.itemId);
  if (!Number.isFinite(authorId) || authorId <= 0) return { ok: false, error: "NOT_FOUND" };
  if (!Number.isFinite(packId) || packId <= 0) return { ok: false, error: "NOT_FOUND" };
  if (!(await getPackagesAuthorById(authorId))) return { ok: false, error: "NOT_FOUND" };

  const project = await getPackagesProject(authorId, packId);
  if (!project) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, marketplaceItemId: project.marketplace_item_id };
}

function errorResponse(error: "FORBIDDEN" | "NOT_FOUND") {
  return NextResponse.json({ error }, { status: error === "FORBIDDEN" ? 403 : 404 });
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const resolved = await resolveLinkedItem(ctx);
  if (!resolved.ok) return errorResponse(resolved.error);

  const { marketplaceItemId } = resolved;
  const showcasePrefix = marketplaceItemId
    ? await getItemShowcasePrefix(marketplaceItemId)
    : null;
  return NextResponse.json({ marketplaceItemId, showcasePrefix });
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const resolved = await resolveLinkedItem(ctx);
  if (!resolved.ok) return errorResponse(resolved.error);

  const { marketplaceItemId } = resolved;
  if (!marketplaceItemId) {
    return NextResponse.json({ error: "NO_MARKETPLACE_ITEM" }, { status: 400 });
  }

  let body: { showcasePrefix?: string | null };
  try {
    body = (await req.json()) as { showcasePrefix?: string | null };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const showcase = normalizeShowcasePrefixInput(body.showcasePrefix, { allowBucket: true });
  if (!showcase.ok) {
    return NextResponse.json({ error: "INVALID_PREFIX" }, { status: 400 });
  }

  try {
    await setItemShowcasePrefix(marketplaceItemId, showcase.value);
    return NextResponse.json({ marketplaceItemId, showcasePrefix: showcase.value });
  } catch (err) {
    console.error("[packages/project showcase PUT]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
