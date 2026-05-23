import { NextRequest } from "next/server";
import { prepareResponse } from "@/lib/laravel-port/api-response";
import {
    checkSubscription,
    isAtomxSecureRejected,
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
    return typeof value === "string" ? value : value == null ? "" : String(value);
}

/**
 * Port of Laravel `ApiStickSubsMf::checkSubscription`:
 *   - require `AtomX-Secure-Check` header (timing-safe compare),
 *   - accept `token` (or `subscription_id`) + `email` in the body,
 *   - look up by `subscription_id` join `users.email`, return 404 otherwise.
 */
export async function POST(req: NextRequest) {
    if (isAtomxSecureRejected(req.headers)) {
        return prepareResponse("Forbidden", 403);
    }

    const body = await readInput(req);
    const token = asString(body.token ?? body.subscription_id);
    const email = asString(body.email);

    if (!token || !email) {
        return prepareResponse("Token and email are required", 422);
    }

    const data = await checkSubscription({ token, email });
    if (data) return prepareResponse(data as unknown as Record<string, unknown>);

    return prepareResponse("The subscription does not exist or it has been deleted", 404);
}
