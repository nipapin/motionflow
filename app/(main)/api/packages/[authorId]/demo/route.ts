import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  getPackagesAuthorById,
  isKeyAllowedForAuthor,
  isPackagesAdmin,
} from "@/lib/packages-admin";
import { updatePackagesAuthorRow } from "@/lib/packages-authors-db";
import {
  getR2Bucket,
  getR2Client,
  r2PublicUrlForKey,
} from "@/lib/r2-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DemoHost = "PR" | "AE";

function parseHost(raw: unknown): DemoHost | null {
  const v = String(raw || "").trim().toUpperCase();
  if (v === "PR" || v === "AE") return v;
  return null;
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
  const authorId = Number((await ctx.params).authorId);
  const author = await getPackagesAuthorById(authorId);
  if (!author) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    author_id: authorId,
    demos: {
      PR: {
        key: author.demoPrKey,
        version: author.demoPrVersion,
        url: author.demoPrKey?.startsWith("public/")
          ? (() => {
              try {
                return r2PublicUrlForKey(author.demoPrKey!);
              } catch {
                return null;
              }
            })()
          : null,
      },
      AE: {
        key: author.demoAeKey,
        version: author.demoAeVersion,
        url: author.demoAeKey?.startsWith("public/")
          ? (() => {
              try {
                return r2PublicUrlForKey(author.demoAeKey!);
              } catch {
                return null;
              }
            })()
          : null,
      },
    },
  });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const authorId = Number((await ctx.params).authorId);
  const author = await getPackagesAuthorById(authorId);
  if (!author) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let body: {
    host?: string;
    key?: string | null;
    version?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const host = parseHost(body.host);
  if (!host) {
    return NextResponse.json({ error: "BAD_HOST" }, { status: 400 });
  }

  if (body.key != null && body.key !== "") {
    const key = body.key.trim().replace(/^\/+/, "");
    if (!isKeyAllowedForAuthor(author, key)) {
      return NextResponse.json({ error: "KEY_NOT_ALLOWED" }, { status: 403 });
    }
  }

  const patch =
    host === "PR"
      ? {
          demo_pr_key: body.key === undefined ? undefined : body.key,
          demo_pr_version: body.version === undefined ? undefined : body.version,
        }
      : {
          demo_ae_key: body.key === undefined ? undefined : body.key,
          demo_ae_version: body.version === undefined ? undefined : body.version,
        };

  try {
    await updatePackagesAuthorRow(authorId, patch);
    const updated = await getPackagesAuthorById(authorId);
    return NextResponse.json({
      author_id: authorId,
      host,
      key: host === "PR" ? updated?.demoPrKey : updated?.demoAeKey,
      version: host === "PR" ? updated?.demoPrVersion : updated?.demoAeVersion,
    });
  } catch (err) {
    console.error("[packages/demo PATCH]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

/** Presign upload for demo zip under author prefix: …/demo/{host}/{version}/pack.zip */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const authorId = Number((await ctx.params).authorId);
  const author = await getPackagesAuthorById(authorId);
  if (!author) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  let body: { host?: string; version?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const host = parseHost(body.host);
  if (!host) return NextResponse.json({ error: "BAD_HOST" }, { status: 400 });

  const version =
    (body.version || "1.0.0").replace(/^v/i, "").replace(/[^0-9A-Za-z._-]+/g, "") ||
    "1.0.0";
  const key = `${author.r2Prefix}demo/${host}/${version}/pack.zip`;
  const bucket = author.r2Bucket?.trim() || getR2Bucket();
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: body.contentType?.trim() || "application/zip",
    CacheControl: "public, max-age=3600",
  });
  const putUrl = await getSignedUrl(client, command, { expiresIn: 600 });

  return NextResponse.json({
    host,
    version,
    key,
    putUrl,
    publicUrl: r2PublicUrlForKey(key),
    bindValue: key,
    expiresIn: 600,
  });
}
