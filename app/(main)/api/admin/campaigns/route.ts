import { NextResponse, type NextRequest } from "next/server";
import { campaignAdmin,campaignError,forbidden } from "@/lib/campaigns/api";
import { listCampaigns,saveCampaign } from "@/lib/campaigns/service";
import { campaignDraftSchema } from "@/lib/campaigns/schema";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest) {
  if (!await campaignAdmin(req)) return forbidden();
  try { return NextResponse.json({campaigns:await listCampaigns()}); } catch(error) { return campaignError(error); }
}
export async function POST(req:NextRequest) {
  const user=await campaignAdmin(req);
  if (!user) return forbidden();
  try {
    const input=campaignDraftSchema.parse(await req.json());
    return NextResponse.json(await saveCampaign(input,user.id),{status:201});
  } catch(error) { return campaignError(error); }
}
