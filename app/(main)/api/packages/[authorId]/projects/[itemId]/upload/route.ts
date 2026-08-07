import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import {
  buildPackagesSecureObjectKey,
  getPackagesProject,
  updatePackagesProject,
} from "@/lib/packages-projects";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Avoid browser→R2 CORS on author buckets; upload via Next server. */
const PREVIEW_MAX_BYTES = 8 * 1024 * 1024;
/** Vercel request body limits; large packs should use Bind from R2. */
const ZIP_MAX_BYTES = 4 * 1024 * 1024;

const PREVIEW_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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
  const author = await getPackagesAuthorById(authorId);
  if (!author || !Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const project = await getPackagesProject(authorId, itemId);
  if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 });
  }

  const kindRaw = String(form.get("kind") || "").trim();
  const kind = kindRaw === "zip" ? "zip" : kindRaw === "preview" ? "preview" : null;
  if (!kind) {
    return NextResponse.json({ error: "BAD_KIND" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "MISSING_FILE" }, { status: 400 });
  }

  const filename = (file.name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const contentType = file.type || "application/octet-stream";
  const buf = Buffer.from(await file.arrayBuffer());

  if (kind === "preview") {
    if (buf.length <= 0 || buf.length > PREVIEW_MAX_BYTES) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", message: "Preview must be under 8 MB" },
        { status: 400 },
      );
    }
    if (contentType && !PREVIEW_TYPES.has(contentType) && !filename.match(/\.(jpe?g|png|webp|gif)$/i)) {
      return NextResponse.json(
        { error: "BAD_TYPE", message: "Use JPEG, PNG, WebP, or GIF" },
        { status: 400 },
      );
    }

    // Always public CDN bucket so CEP/admin can display the image without CORS/CDN gaps.
    const bucket = getR2Bucket();
    const ext = filename.includes(".")
      ? filename.slice(filename.lastIndexOf(".") + 1)
      : "jpg";
    const key = `public/downloads/packages/${authorId}/${itemId}/preview-${Date.now()}.${ext}`;
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buf,
        ContentType: contentType || "image/jpeg",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    const updated = await updatePackagesProject(authorId, itemId, {
      previewKeyOrUrl: key,
    });
    return NextResponse.json({
      project: updated,
      key,
      publicUrl: r2PublicUrlForKey(key),
    });
  }

  // zip
  if (buf.length <= 0 || buf.length > ZIP_MAX_BYTES) {
    return NextResponse.json(
      {
        error: "FILE_TOO_LARGE",
        message:
          "Direct zip upload is limited to 4 MB. Upload the pack to the author R2 bucket and use Bind from R2.",
      },
      { status: 400 },
    );
  }

  const bucket =
    author.r2Bucket?.trim() || process.env.R2_BUCKET?.trim() || null;
  if (!bucket) {
    return NextResponse.json(
      { error: "BUCKET_MISSING", message: "Set the author R2 bucket first" },
      { status: 400 },
    );
  }

  const key = buildPackagesSecureObjectKey(authorId, itemId, filename);
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: "application/zip",
      CacheControl: "private, max-age=0",
    }),
  );

  const updated = await updatePackagesProject(authorId, itemId, {
    downloadKey: key,
  });
  return NextResponse.json({ project: updated, key });
}
