import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATOMX_ENDPOINT = "https://api.get-atomx.com/atomx/v1/mau";
const KING = "PremiereGal";
const TIMEOUT_MS = 10_000;

/**
 * Port of Laravel `PremieregalController::getPackageVersion`. Calls the
 * upstream Atomx update channel and forwards its JSON unchanged. On any
 * network error or non-2xx response we return `{ updater: null }` with status
 * 502 — same fallback Laravel uses.
 */
export async function GET() {
    const url = `${ATOMX_ENDPOINT}?king=${encodeURIComponent(KING)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const upstream = await fetch(url, {
            method: "GET",
            headers: { accept: "application/json" },
            cache: "no-store",
            signal: controller.signal,
        });

        if (!upstream.ok) {
            return NextResponse.json({ updater: null }, { status: 502 });
        }

        let json: unknown;
        try {
            json = await upstream.json();
        } catch {
            return NextResponse.json({ updater: null }, { status: 502 });
        }
        return NextResponse.json(json);
    } catch {
        return NextResponse.json({ updater: null }, { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}
