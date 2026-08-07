import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  assertR2SyncAdmin,
  getPackagesAuthorBySlug,
  isKeyAllowedForAuthor,
} from "@/lib/packages-admin";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-r2sync-secret",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const gate = assertR2SyncAdmin(req);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status, headers: CORS });
  }

  let body: { author?: string; key?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: CORS });
  }

  const author = await getPackagesAuthorBySlug(body.author);
  const key = (body.key || "").replace(/^\/+/, "");
  if (!author || !key) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400, headers: CORS });
  }
  if (!isKeyAllowedForAuthor(author, key)) {
    return NextResponse.json({ error: "KEY_NOT_ALLOWED" }, { status: 403, headers: CORS });
  }

  const contentType = body.contentType?.trim() || "application/octet-stream";
  const client = getR2Client();
  const bucket = author.r2Bucket?.trim() || getR2Bucket();
  const putUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 10 * 60 },
  );

  return NextResponse.json(
    {
      key,
      putUrl,
      publicUrl: r2PublicUrlForKey(key),
      expiresIn: 600,
      author: author.slug,
    },
    { headers: CORS },
  );
}
