import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin } from "@/lib/packages-admin";
import {
  galtoolkitDemoZipKey,
  normalizeDemoHost,
} from "@/lib/galtoolkit-demo";
import { getR2Bucket, getR2Client, r2PublicUrlForKey } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Presigned PUT for Gal Toolkit demo zip. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: { host?: string; version?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const host = normalizeDemoHost(body.host);
  const version = (body.version || "").replace(/^v/i, "").replace(/[^0-9A-Za-z._-]+/g, "");
  if (!host || !version) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  const key = galtoolkitDemoZipKey(host, version);
  const client = getR2Client();
  const bucket = getR2Bucket();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: "application/zip",
    CacheControl: "public, max-age=31536000, immutable",
  });
  const putUrl = await getSignedUrl(client, command, { expiresIn: 10 * 60 });

  return NextResponse.json({
    key,
    putUrl,
    publicUrl: r2PublicUrlForKey(key),
    host,
    version,
    expiresIn: 600,
  });
}
