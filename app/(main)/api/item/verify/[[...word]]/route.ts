import type { NextRequest } from "next/server";
import { apiCheckPurchaseByCode } from "@/lib/laravel-port/sold-items";
import { prepareResponse } from "@/lib/laravel-port/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
    params: Promise<{ word?: string[] }>;
}

/**
 * Port of Laravel `ApiController::itemVerifyPurchase`:
 * verifies an Envato-style purchase code (`sold_items.purchase_code`).
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
    const { word } = await ctx.params;
    const code = word?.[0];
    if (!code) return prepareResponse("Purchase code is required", 422);

    const collection = await apiCheckPurchaseByCode(code);
    if (collection) return prepareResponse({ collection });
    return prepareResponse("The purchase code does not exist or a refund has been made", 404);
}
