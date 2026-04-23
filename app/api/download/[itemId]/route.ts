import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader } from "mysql2/promise";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPool } from "@/lib/db";
import { getMarketItemsByIds } from "@/lib/market-items";
import { getPurchaseCodeForOwnedItem, userOwnsItem } from "@/lib/purchases";
import { motionflowItemDownloadUrl } from "@/lib/motionflow-urls";
import { hasActiveMotionflowSubscription } from "@/lib/subscriptions";

const DL_TABLE = "subscription_downloads";

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

  const base = motionflowItemDownloadUrl(product, itemId, product.name);
  const target = new URL(base);
  target.searchParams.set(codeParam, purchaseCode);
  return NextResponse.redirect(target.toString(), 307);
}
