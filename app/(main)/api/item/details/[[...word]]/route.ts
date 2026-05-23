import type { NextRequest } from "next/server";
import { earningsApiStatsByItem } from "@/lib/laravel-port/sold-items";
import { getItemSimply } from "@/lib/laravel-port/marketplace-items";
import { prepareResponse } from "@/lib/laravel-port/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
    params: Promise<{ word?: string[] }>;
}

/**
 * Port of Laravel `ApiController::itemDetails`:
 *   - validates the integer id,
 *   - returns the marketplace_items row + total `sales` count.
 *
 * Note: `MarketplaceItemResource` in Laravel just calls `parent::toArray($request)`,
 * which is the model attributes — same as our raw row from `getItemSimply`.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
    const { word } = await ctx.params;
    const raw = word?.[0];
    if (!raw) return prepareResponse("Item ID is required", 422);
    if (!/^\d+$/.test(raw)) return prepareResponse("Item ID must be a integer", 422);

    const id = Number(raw);
    const collection = await getItemSimply(id);
    if (!collection) {
        return prepareResponse("The item does not exist or it has been deleted", 404);
    }
    const stats = await earningsApiStatsByItem(id);
    return prepareResponse({ sales: stats.sales, collection });
}
