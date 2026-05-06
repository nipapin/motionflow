import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isInvestor } from "@/lib/auth/access-control";
import { adminCommandSearch } from "@/lib/admin/command-search";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || !isInvestor(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const data = await adminCommandSearch(q);
  return NextResponse.json(data);
}
