import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import {
  assertPackagesAuthorId,
  clonePackagesProject,
  type PackagesProjectHost,
} from "@/lib/packages-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * POST /api/packages/:authorId/projects/:itemId/clone
 * Body (optional): { host?: "PR" | "AE" }
 * Default host = opposite of the source (PR↔AE).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string; itemId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const params = await ctx.params;
  const authorId = parseId(params.authorId);
  const itemId = parseId(params.itemId);
  if (!authorId || !itemId) {
    return NextResponse.json({ error: "BAD_PARAMS" }, { status: 400 });
  }

  try {
    await assertPackagesAuthorId(authorId);
  } catch {
    return NextResponse.json({ error: "UNKNOWN_AUTHOR" }, { status: 404 });
  }

  let host: PackagesProjectHost | string | undefined;
  try {
    const body = (await req.json()) as { host?: string };
    if (body.host) host = body.host;
  } catch {
    /* empty body ok */
  }

  try {
    const project = await clonePackagesProject(authorId, itemId, { host });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[packages/projects/clone]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
