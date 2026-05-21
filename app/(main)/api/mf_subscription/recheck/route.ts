import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/laravel-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel `Route::post('/mf_subscription/recheck', [ApiStickSubsMf, 'recheckSubscriptionWithProof'])`.
 *
 * Requires `AtomX-Secure-Check` header plus `proof_payload` + `proof` body fields,
 * verified against an HMAC built on the Laravel side.
 */
export async function POST(req: NextRequest) {
    return proxyToLaravel(req, "/api/mf_subscription/recheck");
}
