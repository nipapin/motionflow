import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import {
  ADMIN_COUPONS_PER_PAGE,
  getCouponsAdminPage,
  parseCouponSort,
  type AdminCouponSort,
} from "@/lib/admin/coupons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { CouponsTable } from "@/components/admin/coupons-table";

export const metadata: Metadata = { title: "Coupons — Admin" };
export const dynamic = "force-dynamic";

const SORT_LABELS: { id: AdminCouponSort; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "most-used", label: "Most used" },
  { id: "last-activity", label: "Last activity" },
];

type PageProps = {
  searchParams: Promise<{ page?: string; sort?: string; q?: string; active?: string }>;
};

export default async function AdminCouponsPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = parseCouponSort(sp.sort);
  const search = (sp.q ?? "").toString().slice(0, 50);
  const onlyActive = sp.active === "1";

  const { rows, total } = await getCouponsAdminPage(page, sort, { search, onlyActive });
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_COUPONS_PER_PAGE));

  function buildQs(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams();
    if (overrides.page ?? page > 1) params.set("page", String(overrides.page ?? page));
    const nextSort = overrides.sort ?? sort;
    if (nextSort !== "latest") params.set("sort", nextSort);
    const nextSearch = overrides.q ?? search;
    if (nextSearch) params.set("q", nextSearch);
    const nextActive = overrides.active ?? (onlyActive ? "1" : undefined);
    if (nextActive) params.set("active", nextActive);
    const s = params.toString();
    return s ? `?${s}` : "";
  }

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Coupons"
        description="System-wide CRUD over `coupon_services` (mirrors Laravel `Contributor\\Marketing@adminIndex`)."
        badge={{ label: `${total} coupon${total === 1 ? "" : "s"}` }}
        actions={
          <Button asChild size="sm">
            <Link href="/adminzone/coupons/create">
              <Plus className="size-4" />
              New coupon
            </Link>
          </Button>
        }
      />

      <Card className="border-border/60">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-semibold">All coupons</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <form className="flex items-center gap-1" action="/adminzone/coupons" method="get">
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Search code / comment"
                className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs"
                maxLength={50}
              />
              {sort !== "latest" ? <input type="hidden" name="sort" value={sort} /> : null}
              {onlyActive ? <input type="hidden" name="active" value="1" /> : null}
              <Button size="sm" variant="outline" type="submit">
                Find
              </Button>
            </form>
            <Button size="sm" variant={onlyActive ? "default" : "outline"} asChild>
              <Link href={`/adminzone/coupons${buildQs({ active: onlyActive ? undefined : "1", page: "1" })}`}>
                Active only
              </Link>
            </Button>
            <div className="flex flex-wrap gap-1">
              {SORT_LABELS.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={sort === s.id ? "default" : "outline"}
                  asChild
                >
                  <Link href={`/adminzone/coupons${buildQs({ sort: s.id, page: "1" })}`}>{s.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CouponsTable rows={rows} />
          <AdminPagination
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => `/adminzone/coupons${buildQs({ page: String(p) })}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
