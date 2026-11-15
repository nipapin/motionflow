import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { listCepDiagnostics } from "@/lib/cep-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  if (!isAffiliateAdmin(await getSessionUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try { return NextResponse.json(await listCepDiagnostics(req.nextUrl.searchParams), { headers }); }
  catch { return NextResponse.json({ error: "Could not load diagnostics" }, { status: 503, headers }); }
}
