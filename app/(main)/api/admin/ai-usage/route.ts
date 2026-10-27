import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { parseAiUsageFilters, readAiUsage } from "@/lib/ai-usage-store";
import { AiUsageSyncError, syncAiUsage } from "@/lib/ai-usage-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  if (origin === req.nextUrl.origin) return true;
  // nginx forwards the public host/protocol while Next may receive an internal origin.
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!host || !["http", "https"].includes(protocol || "")) return false;
  try { return origin === new URL(`${protocol}://${host}`).origin; }
  catch { return false; }
}

export async function GET(req: NextRequest) {
  if (!isAffiliateAdmin(await getSessionUser())) return reply({ error: "Forbidden" }, 403);
  const filters = parseAiUsageFilters(req.nextUrl.searchParams);
  if (!filters) return reply({ error: "Choose a valid date/time range of up to 366 days and valid filters." }, 400);
  try { return reply(await readAiUsage(filters)); }
  catch { return reply({ error: "Could not load AI usage. Please try again." }, 500); }
}

export async function POST(req: NextRequest) {
  if (!isAffiliateAdmin(await getSessionUser())) return reply({ error: "Forbidden" }, 403);
  // Sync writes cached metadata, so require the same-origin browser used by this admin page.
  if (!sameOrigin(req)) return reply({ error: "Forbidden origin" }, 403);
  const filters = parseAiUsageFilters(req.nextUrl.searchParams);
  if (!filters) return reply({ error: "Choose a valid date/time range of up to 366 days." }, 400);
  const body = await req.json().catch(() => null);
  if (!body || typeof body.restart !== "boolean") return reply({ error: "Invalid sync request" }, 400);
  try { return reply(await syncAiUsage(filters, body.restart, req.signal)); }
  catch (error) {
    if (error instanceof AiUsageSyncError) return reply({ error: error.message }, error.status);
    return reply({ error: "Could not sync Replicate history. Saved progress is retained; try again." }, 502);
  }
}
