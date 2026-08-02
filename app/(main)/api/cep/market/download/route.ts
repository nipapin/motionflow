import { NextRequest, NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import {
  getCepClientConfig,
  requireCepClientConfig,
} from "@/lib/cep-client-registry";
import { userCanDownloadCepPack } from "@/lib/cep-entitlements";
import { getMarketItemsByAuthorId } from "@/lib/market-items";
import { motionflowItemDownloadUrl } from "@/lib/motionflow-urls";
import {
  getPurchaseCodeForOwnedItem,
} from "@/lib/purchases";

export const runtime = "nodejs";

/**
 * GET /api/cep/market/download?pack_id=
 * Server-side gate: sold_items | author subscription | free pack.
 * Redirects to the Motionflow item download URL when allowed.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await resolveCepBearerUser(req.headers.get("authorization"));
    if (!user) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or revoked token" },
        { status: 401 },
      );
    }

    const packId = Number(req.nextUrl.searchParams.get("pack_id"));
    if (!Number.isFinite(packId) || packId <= 0) {
      return NextResponse.json(
        { error: "MISSING_PARAMS", message: "pack_id required" },
        { status: 400 },
      );
    }

    const cfg =
      getCepClientConfig(user.client) ?? requireCepClientConfig("spunkram-cep");

    const gate = await userCanDownloadCepPack({
      userId: user.id,
      packId,
      cfg,
    });

    if (!gate.ok) {
      const status = gate.error === "NOT_FOUND" ? 404 : 403;
      return NextResponse.json(
        {
          error: gate.error,
          message:
            gate.error === "NOT_FOUND"
              ? "Pack not found"
              : "Purchase or Spunkram subscription required",
        },
        { status },
      );
    }

    const products = await getMarketItemsByAuthorId(cfg.authorId, 500);
    const product = products.find((p) => p.id === packId);
    if (!product) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Pack not found" },
        { status: 404 },
      );
    }

    // Prefer web download URL; include purchase_code when owned for upstream gate.
    const downloadUrl = motionflowItemDownloadUrl(
      product,
      product.id,
      product.name,
    );
    const purchaseCode = await getPurchaseCodeForOwnedItem(user.id, packId);
    const target = new URL(downloadUrl);
    if (purchaseCode) {
      target.searchParams.set("code", purchaseCode);
    }

    return NextResponse.redirect(target.toString(), 302);
  } catch (err) {
    console.error("[cep/market/download]", err);
    return NextResponse.json(
      { error: "SERVER_ERROR", message: "Could not start download" },
      { status: 500 },
    );
  }
}
