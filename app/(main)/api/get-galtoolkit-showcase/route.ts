import { NextRequest, NextResponse } from "next/server";
import { proxyToLaravel } from "@/lib/laravel-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel:
 *   `Route::get('/get-galtoolkit-showcase', [ShowcaseController, 'getShowcase'])
 *      ->withoutMiddleware('throttle:api');`
 *
 * Returns 12 random preview clips for the requested package section. The
 * Laravel handler also emits CORS headers — we let them flow through the proxy
 * unchanged.
 */
export async function GET(req: NextRequest) {
    return proxyToLaravel(req, "/api/get-galtoolkit-showcase");
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
}
