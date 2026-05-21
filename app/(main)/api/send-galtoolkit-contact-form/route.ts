import { NextRequest } from "next/server";
import { proxyToLaravel } from "@/lib/laravel-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Port of Laravel:
 *   `Route::post('/send-galtoolkit-contact-form', [GalContactFormController, 'sendContactForm'])`.
 *
 * Distinct from `/api/contact` (which uses the newer Next.js R2 + Telegram
 * pipeline). This endpoint is the simple `name/email/message` mailer used by
 * the PremiereGal Galtoolkit page.
 */
export async function POST(req: NextRequest) {
    return proxyToLaravel(req, "/api/send-galtoolkit-contact-form");
}
