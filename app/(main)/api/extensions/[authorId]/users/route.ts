import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getPackagesAuthorById, isPackagesAdmin } from "@/lib/packages-admin";
import { exportExtensionUsersForAuthor, listExtensionUsersForAuthor } from "@/lib/cep-extension-users";
import { parseExtensionUserFilters, validateUserDateRanges } from "@/lib/user-list-filters";
import { makeCsv, makeMailgunCsv, userCsvResponse } from "@/lib/user-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/extensions/[authorId]/users?q=&page=
 * Packages-admin only. Lists the author's audience; export uses the same filters.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ authorId: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isPackagesAdmin(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const authorId = Number((await ctx.params).authorId);
  if (!Number.isSafeInteger(authorId) || authorId <= 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!(await getPackagesAuthorById(authorId))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const pageRaw = Number(req.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const filters = parseExtensionUserFilters(req.nextUrl.searchParams);
  const dateError = validateUserDateRanges(req.nextUrl.searchParams);
  if (dateError) return NextResponse.json({ error: dateError }, { status: 400 });

  try {
    const format = req.nextUrl.searchParams.get("export");
    if (format === "csv" || format === "mailgun") {
      const users = await exportExtensionUsersForAuthor({ authorId, q, filters });
      const csv = format === "mailgun" ? makeMailgunCsv(users) : makeCsv(
        ["user_id", "email", "name", "registered_at", "last_seen_at", "device_count", "subscription_source", "mailing_opt_in", "email_verified"],
        users.map(u => [u.user_id, u.email, u.name, u.registered_at, u.last_seen_at, u.device_count, u.subscription_source, u.mailing_opt_in, u.email_verified]),
      );
      return userCsvResponse(csv, `author-${authorId}-users-${format}-${new Date().toISOString().slice(0, 10)}.csv`);
    }
    const result = await listExtensionUsersForAuthor({ authorId, q, page, filters });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[extensions/users GET]", err);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
