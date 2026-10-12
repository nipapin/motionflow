import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { campaignAdmin, campaignError, forbidden } from "@/lib/campaigns/api";
import { campaignAudienceSchema } from "@/lib/campaigns/audience-schema";
import { campaignAudiencePreview } from "@/lib/campaigns/audience";
export const runtime = "nodejs";
export const maxDuration = 180;
const inputSchema = z.object({ audience: campaignAudienceSchema, action: z.enum(["preview", "import", "mailing_list"]), key: z.string().uuid().optional(), name: z.string().trim().min(1).max(150).optional() })
  .refine(input => input.action !== "mailing_list" || (input.key && input.name), "Enter a mailing list name");
export async function POST(req: NextRequest) {
  if (!(await campaignAdmin(req))) return forbidden();
  try {
    const input = inputSchema.parse(await req.json());
    return NextResponse.json(await campaignAudiencePreview(input.audience, input.action, input.key && input.name ? { key: input.key, name: input.name } : undefined), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return campaignError(error); }
}
