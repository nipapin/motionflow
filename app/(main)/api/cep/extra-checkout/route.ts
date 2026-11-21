import { NextResponse } from "next/server";
import { resolveCepBearerUser } from "@/lib/cep-auth";
import { getActiveAuthorSubscription } from "@/lib/cep-entitlements";
import { signExtraCheckout } from "@/lib/spunkram-extra-checkout";
import { SPUNKRAM_AUTHOR_ID } from "@/lib/spunkram-paddle-config";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const user = await resolveCepBearerUser(request.headers.get("authorization"));
  if (!user || user.client !== "spunkram-cep") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  }
  const subscription = await getActiveAuthorSubscription(user.id, SPUNKRAM_AUTHOR_ID);
  if (!subscription.active) {
    return NextResponse.json({ error: "SUBSCRIPTION_REQUIRED" }, { status: 403, headers });
  }
  const origin = process.env.NODE_ENV === "development" ? process.env.AUTH_PUBLIC_URL : "https://motionflow.pro";
  const url = new URL("/spunkram", origin || "https://motionflow.pro");
  url.searchParams.set("extraCheckout", await signExtraCheckout(user.id));
  return NextResponse.json({ url: url.toString() }, { headers });
}
