import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { getCepDiagnostic } from "@/lib/cep-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAffiliateAdmin(await getSessionUser())) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  try {
    const report = await getCepDiagnostic((await context.params).id);
    return NextResponse.json(report || { error: "Report not found" }, { status: report ? 200 : 404, headers });
  } catch { return NextResponse.json({ error: "Could not load this report" }, { status: 503, headers }); }
}
