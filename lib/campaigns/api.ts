import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
export async function campaignAdmin(req:NextRequest) {
  const user = await getSessionUser();
  if (!user || !isAffiliateAdmin(user)) return null;
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
    if (origin) {
      try { if (new URL(origin).host !== host) return null; }
      catch { return null; }
    }
  }
  return user;
}
export function campaignError(error:unknown) {
  const known = error instanceof Error && !("code" in error) && !error.message.includes("API key") && !error.message.includes("Paddle API");
  return NextResponse.json({error:known ? error.message : "Operation failed. Check the server configuration and retry."},{status:400});
}
export const forbidden = () => NextResponse.json({error:"FORBIDDEN"},{status:403});
