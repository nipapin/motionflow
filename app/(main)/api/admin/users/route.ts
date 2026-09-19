import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { searchAdminUsers } from "@/lib/admin-users";
import {
  parseAdminUserDateParam,
  parseAdminUserGoogleFilter,
  parseAdminUserRoleFilter,
  parseAdminUserSoldFilter,
  parseAdminUserSortDir,
  parseAdminUserSortField,
  parseAdminUserSubFilter,
  parseAdminUserVerifiedFilter,
} from "@/lib/admin-users-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!isAffiliateAdmin(user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = req.nextUrl;
  const q = url.searchParams.get("q") ?? "";
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) ? pageRaw : 1;
  const role = parseAdminUserRoleFilter(url.searchParams.get("role"));
  const google = parseAdminUserGoogleFilter(url.searchParams.get("google"));
  const verified = parseAdminUserVerifiedFilter(url.searchParams.get("verified"));
  const sold = parseAdminUserSoldFilter(url.searchParams.get("sold"));
  const subscription = parseAdminUserSubFilter(url.searchParams.get("sub"));
  const registeredFrom = parseAdminUserDateParam(url.searchParams.get("registeredFrom"));
  const registeredTo = parseAdminUserDateParam(url.searchParams.get("registeredTo"));
  const sort = parseAdminUserSortField(url.searchParams.get("sort"));
  const dir = parseAdminUserSortDir(url.searchParams.get("dir"));

  try {
    const result = await searchAdminUsers({
      q,
      page,
      role,
      google,
      verified,
      sold,
      subscription,
      registeredFrom,
      registeredTo,
      sort,
      dir,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[admin/users GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
