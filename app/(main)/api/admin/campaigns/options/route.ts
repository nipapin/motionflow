import { NextResponse, type NextRequest } from "next/server";
import { campaignAdmin, campaignError, forbidden } from "@/lib/campaigns/api";
import { campaignAudienceOptions } from "@/lib/campaigns/audience";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (!(await campaignAdmin(req))) return forbidden();
  try { return NextResponse.json(await campaignAudienceOptions(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return campaignError(error); }
}
