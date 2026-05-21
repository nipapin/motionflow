import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/laravel-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel `Route::middleware('auth:sanctum')->get('/user', ...)`.
 *
 * Sanctum cookies live on the Laravel domain (`*.motionflow.com`), so this
 * proxied call only succeeds when the caller supplies its own auth header.
 */
export async function GET(req: NextRequest) {
    return proxyToLaravel(req, "/api/user");
}
