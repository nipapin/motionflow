import { NextResponse } from "next/server";
import { bestItems, freeItems, newestItems } from "@/lib/laravel-port/marketplace-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel `ApiController::preloadHomeData`. Returns the same shape
 * (`{ newestItems, bestItems, freeItems }`) used by the existing homepage
 * client code; sections run in parallel for faster cold response.
 */
export async function GET() {
    const [newest, best, free] = await Promise.all([
        newestItems(8),
        bestItems(8),
        freeItems(4),
    ]);
    return NextResponse.json({
        newestItems: newest,
        bestItems: best,
        freeItems: free,
    });
}
