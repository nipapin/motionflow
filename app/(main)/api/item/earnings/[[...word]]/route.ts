import type { NextRequest } from "next/server";
import { earningsApiStatsByItem } from "@/lib/laravel-port/sold-items";
import { itemExists } from "@/lib/laravel-port/marketplace-items";
import { prepareResponse } from "@/lib/laravel-port/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
    params: Promise<{ word?: string[] }>;
}

function startOfMonthUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
}

function endOfMonthUtc(d: Date): Date {
    return new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    );
}

/**
 * Port of Laravel `ApiController::itemEarnings`:
 * returns earnings for the current month, previous month, and all-time.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
    const { word } = await ctx.params;
    const raw = word?.[0];
    if (!raw) return prepareResponse("Item ID is required", 422);

    const id = Number(raw);
    if (!Number.isFinite(id) || !/^\d+$/.test(raw)) {
        return prepareResponse("Item ID must be a integer", 422);
    }

    if (!(await itemExists(id))) {
        return prepareResponse("The item does not exist or it has been deleted", 404);
    }

    const now = new Date();
    const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const [current, previous, total] = await Promise.all([
        earningsApiStatsByItem(id, startOfMonthUtc(now), endOfMonthUtc(now)),
        earningsApiStatsByItem(id, startOfMonthUtc(prevMonth), endOfMonthUtc(prevMonth)),
        earningsApiStatsByItem(id, null, null),
    ]);

    return prepareResponse({
        current_month: current,
        previous_month: previous,
        total,
    });
}
