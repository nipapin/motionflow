import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import {
  isDownloadKeyAllowedForAuthor,
  updatePackagesProject,
} from "@/lib/packages-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bind an existing R2 object as the project download archive (no re-upload). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string; itemId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const params = await ctx.params;
  const authorId = Number(params.authorId);
  const itemId = Number(params.itemId);
  const author = getPackagesAuthorById(authorId);
  if (!author || !Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const key = (body.key || "").trim().replace(/^\/+/, "");
  if (!key) return NextResponse.json({ error: "MISSING_KEY" }, { status: 400 });
  if (!isDownloadKeyAllowedForAuthor(author, key)) {
    return NextResponse.json({ error: "KEY_NOT_ALLOWED" }, { status: 403 });
  }

  try {
    const project = await updatePackagesProject(authorId, itemId, {
      downloadKey: key,
    });
    return NextResponse.json({ project });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[packages/bind-r2]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
