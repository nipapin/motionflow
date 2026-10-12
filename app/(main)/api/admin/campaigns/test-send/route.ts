import { NextResponse, type NextRequest } from "next/server";
import { campaignAdmin, campaignError, forbidden } from "@/lib/campaigns/api";
import { campaignTestSendSchema } from "@/lib/campaigns/schema";
import { sendCampaignTest } from "@/lib/campaigns/test-send";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  if (!(await campaignAdmin(req))) return forbidden();
  try {
    const input = campaignTestSendSchema.parse(await req.json());
    return NextResponse.json(await sendCampaignTest(input), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return campaignError(error); }
}
