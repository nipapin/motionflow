import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/laravel-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel `Route::post('/mf_subscription/check', [ApiStickSubsMf, 'checkSubscription'])`.
 *
 * Requires the `AtomX-Secure-Check` header to be set by the caller — the proxy
 * forwards it verbatim. Body fields (Laravel-side): `token` or `subscription_id`,
 * plus `email`.
 */
export async function POST(req: NextRequest) {
    return proxyToLaravel(req, "/api/mf_subscription/check");
}
