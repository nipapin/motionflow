import { NextRequest, NextResponse } from "next/server";
import { getShowcaseForSection } from "@/lib/laravel-port/showcase-tree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-cache, no-store, must-revalidate",
} as const;

/**
 * Port of Laravel `ShowcaseController::getShowcase`. Mirrors the Laravel
 * response shape (`{ items, jsonPath }`) and CORS headers.
 *
 * Used cross-origin by the PremiereGal Galtoolkit page, so we expose a CORS
 * preflight (`OPTIONS`) in addition to `GET`.
 */
export async function GET(req: NextRequest) {
    const sectionRaw = req.nextUrl.searchParams.get("section") ?? "";
    const section = decodeURIComponent(sectionRaw);

    const result = await getShowcaseForSection(section);
    if (!result) {
        return NextResponse.json({ error: "Section not found" }, { status: 404, headers: CORS_HEADERS });
    }
    return NextResponse.json(result, { status: 200, headers: CORS_HEADERS });
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
