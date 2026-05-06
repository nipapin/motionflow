import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import {
  getAssignedToMeOpenCount,
  getOpenRequestCounts,
  getRequestsPage,
  parseRequestSort,
  requestSortFromSegment,
  REQUESTS_PER_PAGE,
} from "@/lib/admin/requests";
import { RequestsFilterTabs } from "@/components/admin/requests-filter-tabs";
import { RequestsTable } from "@/components/admin/requests-table";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { RequestSortKey } from "@/lib/admin/requests";

export const metadata: Metadata = {
  title: "Requests — Admin",
};

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ segments?: string[] }>;
  searchParams: Promise<{ sort?: string; page?: string }>;
};

export default async function AdminRequestsPage({ params, searchParams }: PageProps) {
  const user = ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const { segments } = await params;
  const sortFromPath = requestSortFromSegment(segments?.[0]);
  const sort = sortFromPath ?? parseRequestSort(sp.sort);
  const page = Math.max(1, Number(sp.page) || 1);

  const [typeCounts, assignedOpen, { rows, total }] = await Promise.all([
    getOpenRequestCounts(),
    getAssignedToMeOpenCount(user.id),
    getRequestsPage(sort, user.id, page),
  ]);

  const allOpen = Object.values(typeCounts).reduce((s, n) => s + n, 0);

  const badges: Record<RequestSortKey, number> = {
    assigned: assignedOpen,
    all: allOpen,
    business: typeCounts.business_contact ?? 0,
    support: typeCounts.support_contact ?? 0,
    become_author: typeCounts.become_author_request ?? 0,
    become_affiliate: typeCounts.become_affiliate_request ?? 0,
    bug_report: typeCounts.bug_report ?? 0,
  };

  const totalPages = Math.max(1, Math.ceil(total / REQUESTS_PER_PAGE));

  const qs = (p: number) => {
    const q = new URLSearchParams();
    q.set("sort", sort);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <RequestsFilterTabs active={sort} badges={badges} />

      {rows.length === 0 ? (
        <Empty className="border border-border/60 bg-muted/10">
          <EmptyHeader>
            <EmptyTitle>No requests</EmptyTitle>
            <EmptyDescription>Try another filter or check back later.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <RequestsTable rows={rows} />
      )}

      {totalPages > 1 ? (
        <div className="flex justify-center gap-2">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/adminzone/requests${qs(page - 1)}`}>Previous</Link>
            </Button>
          ) : null}
          <span className="flex items-center px-2 text-sm text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/adminzone/requests${qs(page + 1)}`}>Next</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
