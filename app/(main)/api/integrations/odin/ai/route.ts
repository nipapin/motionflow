import { createHash, timingSafeEqual } from "node:crypto";
import { odinAiUserFromProfile } from "@/lib/odin-ai";
import { odinAccountUsage, usagePage } from "@/lib/odin-ai-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status=200) => Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});

/** Only the Odin website server may attest a website-session account here. */
export async function POST(request: Request) {
  const secret=process.env.ODIN_MANAGEMENT_SECRET;
  const authorization=request.headers.get("authorization");
  if (!secret || secret.length<32 || !authorization?.startsWith("Bearer ") ||
    !timingSafeEqual(createHash("sha256").update(authorization.slice(7)).digest(),createHash("sha256").update(secret).digest())) {
    return json({error:"UNAUTHORIZED"},401);
  }
  let body: Record<string, unknown>;
  try { body=await request.json(); if(!body || typeof body!=="object" || Array.isArray(body))throw new Error(); }
  catch { return json({error:"INVALID_REQUEST"},400); }
  try {
    const user=odinAiUserFromProfile(body.profile);
    if(!user)return json({error:"INVALID_ACCOUNT"},400);
    if(body.action==="usage")return json(await odinAccountUsage(user,usagePage(body.page)));
    return json({error:"INVALID_ACTION"},400);
  } catch(error){
    const message=error instanceof Error?error.message:"";
    if(["INVALID_PAGE","Invalid Odin AI entitlement","Invalid Odin AI period","Odin AI period is unavailable"].includes(message))return json({error:"INVALID_REQUEST"},400);
    console.error("[odin-account-ai] request failed",error instanceof Error?error.name:"Database error");
    return json({error:"GENERATIONS_UNAVAILABLE"},503);
  }
}
