import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/laravel-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel:
 *   `Route::get('/get-package-version', [PremieregalController, 'getPackageVersion'])
 *      ->withoutMiddleware('throttle:api');`
 *
 * Laravel side calls api.get-atomx.com with `king=PremiereGal` and returns the
 * "updater" payload; we just forward whatever Laravel returns.
 */
export async function GET(req: NextRequest) {
    return proxyToLaravel(req, "/api/get-package-version");
}
