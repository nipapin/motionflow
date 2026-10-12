import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import { createR2AccountBucket, listR2AccountBuckets } from "@/lib/packages-r2-buckets";
import { newPackagesBucketSchema } from "@/lib/packages-author-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/packages/buckets — R2 buckets visible to the server credentials. */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const buckets = await listR2AccountBuckets();
    return NextResponse.json({ buckets });
  } catch (err) {
    console.error("[packages/buckets GET]", err);
    return NextResponse.json(
      { error: "LIST_FAILED", message: "Could not list R2 buckets" },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "INVALID_JSON", message: "Invalid request" }, { status: 400 });
  }
  const parsed = newPackagesBucketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BUCKET", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    if ((await listR2AccountBuckets()).includes(parsed.data.name)) {
      return NextResponse.json({ error: "BUCKET_EXISTS", message: "This bucket already exists. Select it from the list." }, { status: 409 });
    }
    const bucket = await createR2AccountBucket(parsed.data.name);
    return NextResponse.json({ bucket }, { status: 201 });
  } catch (err) {
    const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
    if (name === "BucketAlreadyExists" || name === "BucketAlreadyOwnedByYou") {
      return NextResponse.json({ error: "BUCKET_EXISTS", message: "This bucket already exists. Select it from the list." }, { status: 409 });
    }
    if (name === "AccessDenied") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "The R2 credentials do not have permission to create buckets." }, { status: 502 });
    }
    console.error("[packages/buckets POST]", err);
    return NextResponse.json({ error: "CREATE_FAILED", message: "Could not create the R2 bucket. Try again." }, { status: 502 });
  }
}
