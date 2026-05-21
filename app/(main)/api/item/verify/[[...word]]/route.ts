import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/laravel-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
    params: Promise<{ word?: string[] }>;
}

/**
 * Port of Laravel `Route::get('/item/verify/{word?}', [ApiController, 'itemVerifyPurchase'])`.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
    const { word } = await ctx.params;
    const tail = word && word.length > 0 ? `/${word.map(encodeURIComponent).join("/")}` : "";
    return proxyToLaravel(req, `/api/item/verify${tail}`);
}
