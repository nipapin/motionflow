import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";
import {
  updatePackagesAuthorRow,
  type PackagesAuthorPatch,
} from "@/lib/packages-authors-db";

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

function authorDto(a: NonNullable<Awaited<ReturnType<typeof getPackagesAuthorById>>>) {
  return {
    id: a.id,
    slug: a.slug,
    label: a.label,
    r2_bucket: a.r2Bucket,
    r2_prefix: a.r2Prefix,
    demo_pr_key: a.demoPrKey,
    demo_ae_key: a.demoAeKey,
    demo_pr_version: a.demoPrVersion,
    demo_ae_version: a.demoAeVersion,
    logoUrl: packagesAuthorLogoUrl(a.slug),
  };
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
    const author = await getPackagesAuthorById(authorId);
    if (!author) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ author: authorDto(author) });
  } catch (err) {
    console.error("[packages/authors/:id GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const authorId = parseAuthorId((await ctx.params).authorId);
  if (!authorId) return NextResponse.json({ error: "BAD_AUTHOR" }, { status: 400 });

  let body: PackagesAuthorPatch;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  try {
    await updatePackagesAuthorRow(authorId, body);
    const author = await getPackagesAuthorById(authorId);
    if (!author) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ author: authorDto(author) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    console.error("[packages/authors/:id PATCH]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
