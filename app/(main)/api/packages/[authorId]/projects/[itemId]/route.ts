import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import {
  getPackagesProject,
  isDownloadKeyAllowedForAuthor,
  updatePackagesProject,
  type PackagesProjectPatch,
} from "@/lib/packages-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIds(authorIdRaw: string, itemIdRaw: string) {
  const authorId = Number(authorIdRaw);
  const itemId = Number(itemIdRaw);
  if (!Number.isFinite(authorId) || authorId <= 0) return null;
  if (!Number.isFinite(itemId) || itemId <= 0) return null;
  return { authorId, itemId };
}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) return null;
  return user;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ authorId: string; itemId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const params = await ctx.params;
  const ids = parseIds(params.authorId, params.itemId);
  if (!ids || !getPackagesAuthorById(ids.authorId)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const project = await getPackagesProject(ids.authorId, ids.itemId);
    if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (err) {
    console.error("[packages/project GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string; itemId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const params = await ctx.params;
  const ids = parseIds(params.authorId, params.itemId);
  const author = ids ? getPackagesAuthorById(ids.authorId) : null;
  if (!ids || !author) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let body: PackagesProjectPatch & { downloadKey?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (body.downloadKey != null && body.downloadKey !== "") {
    if (!isDownloadKeyAllowedForAuthor(author, body.downloadKey)) {
      return NextResponse.json({ error: "KEY_NOT_ALLOWED" }, { status: 403 });
    }
  }

  try {
    const project = await updatePackagesProject(ids.authorId, ids.itemId, body);
    return NextResponse.json({ project });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[packages/project PATCH]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
