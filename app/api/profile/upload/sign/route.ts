import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAuthor } from "@/lib/auth/access-control";
import { marketplaceItemsTable } from "@/lib/author/marketplace-table";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";

const schema = z
  .object({
    itemId: z.coerce.number().int().positive(),
    contentType: z.string().min(3).max(120),
    extension: z.enum(["jpg", "jpeg", "png", "webp", "mp4", "zip"]),
  })
  .strict();

/**
 * Presigned PUT for contributor uploads (Laravel-aligned `preview/{itemId}/…` on R2).
 * Client uploads with `PUT putUrl` then uses `publicUrl` in the form / `files` JSON.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !isAuthor(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { itemId } = parsed.data;
  const table = marketplaceItemsTable();
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM \`${table}\` WHERE id = ? AND author_id = ? LIMIT 1`,
    [itemId, user.id],
  );
  if (!rows.length) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  try {
    const ext = parsed.data.extension === "jpeg" ? "jpg" : parsed.data.extension;
    const key = `preview/${itemId}/${randomUUID()}.${ext}`;
    const client = getR2Client();
    const bucket = getR2Bucket();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: parsed.data.contentType,
    });
    const putUrl = await getSignedUrl(client, command, { expiresIn: 10 * 60 });
    return NextResponse.json({ putUrl, publicUrl: r2PublicUrlForKey(key), key });
  } catch (e) {
    console.error("[upload/sign]", e);
    return NextResponse.json({ error: "R2 presign not configured or failed" }, { status: 503 });
  }
}
