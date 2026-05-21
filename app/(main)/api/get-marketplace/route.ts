import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/laravel-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel `Route::get('/get-marketplace', [ApiController, 'preloadHomeData'])`.
 *
 * Returns `{ newestItems, bestItems, freeItems }` for the marketplace landing.
 */
export async function GET(req: NextRequest) {
    return proxyToLaravel(req, "/api/get-marketplace");
}
