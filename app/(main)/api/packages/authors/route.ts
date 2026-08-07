import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isPackagesAdmin, listPackagesAuthors } from "@/lib/packages-admin";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    const authors = await listPackagesAuthors();
    return NextResponse.json({
      authors: authors.map((a) => ({
        id: a.id,
        slug: a.slug,
        label: a.label,
        r2_bucket: a.r2Bucket,
        logoUrl: packagesAuthorLogoUrl(a.slug),
      })),
    });
  } catch (err) {
    console.error("[packages/authors GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
