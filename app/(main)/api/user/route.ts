import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel `Route::middleware('auth:sanctum')->get('/user', ...)`.
 *
 * Now backed by the Next.js session (`SESSION_COOKIE_NAME`) with fallback to
 * the legacy Laravel session cookie via `getSessionUser()`. Returns 401 when
 * unauthenticated, mirroring the Sanctum behaviour.
 */
export async function GET() {
    const user = await getSessionUser();
    if (!user) {
        return NextResponse.json({ message: "Unauthenticated." }, { status: 401 });
    }
    return NextResponse.json({
        id: user.id,
        email: user.email,
        name: user.name,
        access: user.access,
    });
}
