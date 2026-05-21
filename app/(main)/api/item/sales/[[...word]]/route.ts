import type { NextRequest } from "next/server";
import { salesApiStatsByItem } from "@/lib/laravel-port/sold-items";
import { prepareResponse } from "@/lib/laravel-port/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
    params: Promise<{ word?: string[] }>;
}

/**
 * Port of Laravel `ApiController::itemSales`. Note: Laravel's `has_item` is
 * `MAX(item_id)` over the matching rows, so a missing item just yields a 0.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
    const { word } = await ctx.params;
    const raw = word?.[0];
    if (!raw) return prepareResponse("Item ID is required", 422);
    if (!/^\d+$/.test(raw)) return prepareResponse("Item ID must be a integer", 422);

    const id = Number(raw);
    const stats = await salesApiStatsByItem(id);
    if (stats.has_item) {
        return prepareResponse({ total_sales: stats.total_sales });
    }
    return prepareResponse("The item does not exist or it has been deleted", 404);
}
