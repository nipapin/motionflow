import { NextResponse } from "next/server";
import { affiliateNavFlags } from "@/lib/affiliate/nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Nav flags for the account dropdown on the main site (not only /profile). */
export async function GET() {
  try {
    const flags = await affiliateNavFlags();
    return NextResponse.json(flags);
  } catch (err) {
    console.error("[affiliate/nav GET]", err);
    return NextResponse.json({ showPartners: false, showAffiliate: false });
  }
}
