import { NextRequest } from "next/server";
import { prepareResponse } from "@/lib/laravel-port/api-response";
import {
    isAtomxSecureRejected,
    recheckSubscription,
    verifySubscriptionProof,
} from "@/lib/laravel-port/subscription-system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readInput(req: NextRequest): Promise<Record<string, unknown>> {
    const ct = (req.headers.get("content-type") ?? "").toLowerCase();
    try {
        if (ct.includes("application/json")) {
            const body = await req.json();
            return typeof body === "object" && body != null ? (body as Record<string, unknown>) : {};
        }
        if (
            ct.includes("application/x-www-form-urlencoded") ||
            ct.includes("multipart/form-data")
        ) {
            const form = await req.formData();
            return Object.fromEntries(form.entries());
        }
        const body = await req.json().catch(() => null);
        return typeof body === "object" && body != null ? (body as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

/**
 * Port of Laravel `ApiStickSubsMf::recheckSubscriptionWithProof`:
 *   - require `AtomX-Secure-Check` header,
 *   - verify the HMAC `proof` over `proof_payload` (base64-encoded
 *     `{v:1,id,email}`), then look up by id+email.
 */
export async function POST(req: NextRequest) {
    if (isAtomxSecureRejected(req.headers)) {
        return prepareResponse("Forbidden", 403);
    }

    const body = await readInput(req);
    const proofPayload = asString(body.proof_payload);
    const proof = asString(body.proof);

    const parsed = verifySubscriptionProof(proofPayload, proof);
    if (!parsed) {
        return prepareResponse("Invalid proof", 422);
    }

    const data = await recheckSubscription(parsed);
    if (data) return prepareResponse(data as unknown as Record<string, unknown>);

    return prepareResponse("The subscription does not exist or it has been deleted", 404);
}
