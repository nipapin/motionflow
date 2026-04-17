import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { hasActiveSubscription } from "@/lib/subscriptions";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ active: false });
  }
  const active = await hasActiveSubscription(user.id);
  return NextResponse.json({ active });
}
