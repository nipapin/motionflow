import { NextResponse,type NextRequest } from "next/server";
import { campaignAdmin,campaignError,forbidden } from "@/lib/campaigns/api";
import { prepareCampaign,processCampaign,returnCampaignToDraft } from "@/lib/campaigns/service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=120;
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string;action:string}>}) {
  const user=await campaignAdmin(req);
  if (!user) return forbidden();
  const {id,action}=await params;
  try {
    if (action === "prepare") return NextResponse.json(await prepareCampaign(id));
    if (action === "draft") return NextResponse.json(await returnCampaignToDraft(id));
    if (action === "apply" || action === "send") return NextResponse.json(await processCampaign(id,action,user.id));
    return NextResponse.json({error:"Unknown action"},{status:404});
  } catch(error) { return campaignError(error); }
}
