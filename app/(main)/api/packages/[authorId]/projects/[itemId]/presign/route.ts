import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { getPackagesProject } from "@/lib/packages-projects";
import { buildMarketplaceSecureObjectKey } from "@/lib/marketplace-r2-presign";
import {
  getR2Bucket,
  getR2Client,
  r2PublicUrlForKey,
} from "@/lib/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Kind = "preview" | "video" | "zip";

function privateBucket(): string | null {
  return process.env.R2_BUCKET?.trim() || null;
}

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

  const project = await getPackagesProject(authorId, itemId);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let body: { kind?: string; filename?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const kind = (body.kind || "").trim() as Kind;
  if (kind !== "preview" && kind !== "video" && kind !== "zip") {
    return NextResponse.json({ error: "BAD_KIND" }, { status: 400 });
  }

  const filename = (body.filename || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const contentType = body.contentType?.trim() || "application/octet-stream";
  const client = getR2Client();

  if (kind === "zip") {
    const bucket = privateBucket();
    if (!bucket) {
      return NextResponse.json({ error: "PRIVATE_BUCKET_MISSING" }, { status: 503 });
    }
    const stem = filename.replace(/\.zip$/i, "") || `pack-${itemId}`;
    const key = buildMarketplaceSecureObjectKey(itemId, stem);
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "application/zip",
      CacheControl: "private, max-age=0",
    });
    const putUrl = await getSignedUrl(client, command, { expiresIn: 600 });
    return NextResponse.json({
      kind,
      key,
      putUrl,
      /** Stored in files.main as stem for secure layout. */
      bindValue: stem,
      expiresIn: 600,
    });
  }

  const publicBucket = getR2Bucket();
  const ext =
    filename.includes(".")
      ? filename.slice(filename.lastIndexOf(".") + 1)
      : kind === "video"
        ? "mp4"
        : "png";
  const prefix = author.r2Prefixes[0] || "public/downloads/";
  const key = `${prefix}packages/${itemId}/${kind}-${Date.now()}.${ext}`;
  const command = new PutObjectCommand({
    Bucket: publicBucket,
    Key: key,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  });
  const putUrl = await getSignedUrl(client, command, { expiresIn: 600 });

  return NextResponse.json({
    kind,
    key,
    putUrl,
    publicUrl: r2PublicUrlForKey(key),
    bindValue: key,
    expiresIn: 600,
  });
}
