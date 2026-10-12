import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin, listPackagesAuthors } from "@/lib/packages-admin";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";
import { newPackagesAuthorSchema } from "@/lib/packages-author-input";
import { createPackagesAuthorRow, PackagesAuthorCreationError } from "@/lib/packages-authors-db";
import { listR2AccountBuckets, normalizePackagesBucketName } from "@/lib/packages-r2-buckets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const authors = await listPackagesAuthors();
    return NextResponse.json({
      authors: authors.map((a) => ({
        id: a.id,
        slug: a.slug,
        label: a.label,
        r2_bucket: a.r2Bucket,
        logoUrl: packagesAuthorLogoUrl(a.slug),
      })),
    });
  } catch (err) {
    console.error("[packages/authors GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Invalid request" }, { status: 400 });
  }
  const parsed = newPackagesAuthorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_AUTHOR", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const bucket = normalizePackagesBucketName(parsed.data.r2_bucket);
  if (!bucket.ok) {
    return NextResponse.json({ error: "INVALID_BUCKET", message: bucket.error }, { status: 400 });
  }
  if (bucket.value) {
    try {
      const buckets = await listR2AccountBuckets();
      if (!buckets.includes(bucket.value)) {
        return NextResponse.json({ error: "BUCKET_NOT_FOUND", message: "Select an available R2 bucket" }, { status: 400 });
      }
    } catch (err) {
      console.error("[packages/authors POST] list buckets", err);
      return NextResponse.json({ error: "LIST_FAILED", message: "Could not verify R2 buckets. Try again." }, { status: 502 });
    }
  }

  try {
    const author = await createPackagesAuthorRow({ ...parsed.data, r2_bucket: bucket.value });
    return NextResponse.json({ author: {
      id: author.id,
      slug: author.slug,
      label: author.label,
      r2_bucket: author.r2_bucket,
      logoUrl: packagesAuthorLogoUrl(author.slug),
    } }, { status: 201 });
  } catch (err) {
    if (err instanceof PackagesAuthorCreationError) {
      return NextResponse.json({ error: err.code, message: err.message }, {
        status: err.code === "USER_NOT_FOUND" ? 404 : 409,
      });
    }
    if (err && typeof err === "object" && "code" in err && err.code === "ER_DUP_ENTRY") {
      return NextResponse.json({ error: "AUTHOR_EXISTS", message: "An author with this ID or slug already exists" }, { status: 409 });
    }
    console.error("[packages/authors POST]", err);
    return NextResponse.json({ error: "SERVER_ERROR", message: "Could not create the author. Try again." }, { status: 500 });
  }
}
