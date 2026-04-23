import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPool } from "@/lib/db";
import { getMarketItemsByIds } from "@/lib/market-items";
import { getPurchaseCodeForOwnedItem, userOwnsItem } from "@/lib/purchases";
import { motionflowItemDownloadUrl } from "@/lib/motionflow-urls";
import {
  buildAttachmentFilename,
  buildUpstreamRequestHeaders,
  looksLikeHtmlErrorResponse,
} from "@/lib/motionflow-upstream-download";
import { getPresignedMarketplaceDownloadUrl } from "@/lib/marketplace-r2-presign";
import { hasActiveMotionflowSubscription } from "@/lib/subscriptions";

const DL_TABLE = "subscription_downloads";

/**
 * When `R2_BUCKET` is set (private marketplace bucket, same as Laravel `services.r2.bucket`),
 * successful auth returns **303** to a presigned GetObject URL (see `lib/marketplace-r2-presign.ts`).
 * Optional: `MARKETPLACE_SECURE_KEY_PREFIX` (default `secure/market/items/`), `MOTIONFLOW_DOWNLOAD_USE_R2_PRESIGN=0` to force Laravel proxy only.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId: rawId } = await context.params;
  const itemId = Number(rawId);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "invalid item" }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.redirect(new URL("/?signin=1", _req.url));
  }

  const [subOk, owns] = await Promise.all([
    hasActiveMotionflowSubscription(user.id),
    userOwnsItem(user.id, itemId),
  ]);

  if (!subOk && !owns) {
    return NextResponse.redirect(new URL("/pricing", _req.url));
  }

  const products = await getMarketItemsByIds([itemId]);
  const product = products[0];
  if (!product) {
    return NextResponse.json({ error: "item not found" }, { status: 404 });
  }

  const codeParam =
    process.env.MOTIONFLOW_ITEM_DOWNLOAD_CODE_PARAM?.trim() || "purchase_code";

  let purchaseCode: string;

  if (subOk) {
    purchaseCode = crypto.randomBytes(16).toString("hex");
    const pool = getPool();
    await pool.execute<ResultSetHeader>(
      `INSERT INTO \`${DL_TABLE}\` (item_id, user_id, author_id, purchase_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [itemId, user.id, product.author_id, purchaseCode],
    );
  } else {
    const sold = await getPurchaseCodeForOwnedItem(user.id, itemId);
    if (!sold) {
      return NextResponse.json(
        { error: "No purchase code for this item. Contact support." },
        { status: 409 },
      );
    }
    purchaseCode = sold;
  }

  let presignedR2: string | null = null;
  try {
    presignedR2 = await getPresignedMarketplaceDownloadUrl(product);
  } catch (e) {
    console.error("[download] R2 presign skipped", e);
  }
  if (presignedR2) {
    return NextResponse.redirect(presignedR2, 303);
  }

  const base = motionflowItemDownloadUrl(product, itemId, product.name);
  const target = new URL(base);
  target.searchParams.set(codeParam, purchaseCode);
  const upstreamUrl = target.toString();

  const upstreamHeaders = buildUpstreamRequestHeaders(upstreamUrl);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (e) {
    console.error("[download] upstream fetch failed", e);
    return NextResponse.json(
      { error: "Could not reach the file server. Try again later." },
      { status: 502 },
    );
  }

  if (upstream.status === 401 || upstream.status === 403) {
    const hasServiceCookie = !!(
      process.env.MOTIONFLOW_DOWNLOAD_UPSTREAM_COOKIE?.trim() ||
      process.env.MOTIONFLOW_DOWNLOAD_UPSTREAM_COOKIES?.trim()
    );
    const hint = hasServiceCookie
      ? "Cookie is set but Laravel still returned 401/403. Copy a fresh Cookie from motionflow.pro (session may have expired), ensure it includes laravel_session and XSRF-TOKEN, or add MOTIONFLOW_INTERNAL_DOWNLOAD_KEY if the main app supports it."
      : "Add MOTIONFLOW_DOWNLOAD_UPSTREAM_COOKIE to the server env (same value as the browser Cookie header on motionflow.pro: DevTools → Application → Cookies, or Network → request headers). Must include laravel_session; XSRF-TOKEN is added as X-XSRF-TOKEN automatically. Alternatively configure the Laravel app to trust X-Motionflow-Next-Key (MOTIONFLOW_INTERNAL_DOWNLOAD_KEY).";
    return NextResponse.json(
      { error: "Upstream denied access to the file.", hint },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error(
      "[download] upstream not ok",
      upstream.status,
      errText.slice(0, 400),
    );
    return NextResponse.json(
      {
        error: `The file could not be prepared (${upstream.status}).`,
        hint:
          "If the catalog runs on a different host, set NEXT_PUBLIC_MOTIONFLOW_SITE / MOTIONFLOW_DOWNLOAD_UPSTREAM_REFERER.",
      },
      { status: 502 },
    );
  }

  const ct = upstream.headers.get("content-type");
  if (ct && /text\/html/i.test(ct)) {
    const html = await upstream.text();
    if (looksLikeHtmlErrorResponse(ct, html)) {
      console.error(
        "[download] upstream returned HTML",
        html.slice(0, 200),
      );
      return NextResponse.json(
        {
          error:
            "The main site returned a web page instead of a file. Configure MOTIONFLOW_DOWNLOAD_UPSTREAM_COOKIE or server-side access on the Laravel app.",
        },
        { status: 502 },
      );
    }
  }

  const outHeaders = new Headers();
  if (ct && !/text\/html/i.test(ct)) {
    outHeaders.set("Content-Type", ct);
  } else {
    outHeaders.set("Content-Type", "application/octet-stream");
  }

  const cl = upstream.headers.get("content-length");
  if (cl) outHeaders.set("Content-Length", cl);

  const filename = buildAttachmentFilename(
    product.name,
    itemId,
    upstream.headers.get("content-disposition"),
  );
  outHeaders.set(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(filename).replaceAll("'", "%27")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );

  outHeaders.set("Cache-Control", "private, no-store");

  if (!upstream.body) {
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, { status: 200, headers: outHeaders });
  }

  return new NextResponse(upstream.body, { status: 200, headers: outHeaders });
}
