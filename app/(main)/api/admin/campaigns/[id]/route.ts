import { NextResponse,type NextRequest } from "next/server";
import { campaignAdmin,campaignError,forbidden } from "@/lib/campaigns/api";
import { getCampaign,saveCampaign } from "@/lib/campaigns/service";
import { campaignDraftSchema } from "@/lib/campaigns/schema";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,context:Context) {
  if (!await campaignAdmin(req)) return forbidden();
  try { return NextResponse.json(await getCampaign((await context.params).id)); } catch(error) { return campaignError(error); }
}
export async function PUT(req:NextRequest,context:Context) {
  const user=await campaignAdmin(req);
  if (!user) return forbidden();
  try {
    const input=campaignDraftSchema.parse(await req.json());
    return NextResponse.json(await saveCampaign(input,user.id,(await context.params).id));
  } catch(error) { return campaignError(error); }
}
