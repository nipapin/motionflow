import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import {
  assertPackagesAuthorId,
  createPackagesProject,
  listPackagesProjects,
  type PackagesProjectHost,
} from "@/lib/packages-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseAuthorId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) return null;
  return user;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const authorId = parseAuthorId((await ctx.params).authorId);
  if (!authorId) return NextResponse.json({ error: "BAD_AUTHOR" }, { status: 400 });
  try {
    await assertPackagesAuthorId(authorId);
  } catch {
    return NextResponse.json({ error: "UNKNOWN_AUTHOR" }, { status: 404 });
  }

  try {
    const projects = await listPackagesProjects(authorId);
    return NextResponse.json({ author_id: authorId, projects });
  } catch (err) {
    console.error("[packages/projects GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const authorId = parseAuthorId((await ctx.params).authorId);
  if (!authorId) return NextResponse.json({ error: "BAD_AUTHOR" }, { status: 400 });
  try {
    await assertPackagesAuthorId(authorId);
  } catch {
    return NextResponse.json({ error: "UNKNOWN_AUTHOR" }, { status: 404 });
  }

  let body: { name?: string; version?: string; host?: PackagesProjectHost | string } =
    {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  try {
    const project = await createPackagesProject({
      authorId,
      name: body.name,
      version: body.version,
      host: body.host,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("[packages/projects POST]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
