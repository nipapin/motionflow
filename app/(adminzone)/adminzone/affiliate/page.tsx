import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import {
  ADMIN_AFFILIATE_PER_PAGE,
  getAffiliateAdminPage,
  parseAffiliateSort,
} from "@/lib/admin/affiliate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AffiliateRowActions } from "@/components/admin/affiliate-row-actions";

export const metadata: Metadata = { title: "Affiliate (admin) — Admin" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ page?: string; sort?: string }>;
};

const SORT_LABELS: { id: ReturnType<typeof parseAffiliateSort>; label: string }[] = [
  { id: "last-created", label: "Last created" },
  { id: "last-activity", label: "Last activity" },
  { id: "max-clicks", label: "Max clicks" },
  { id: "max-earnings", label: "Max earnings" },
];

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function AdminAffiliatePage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const sort = parseAffiliateSort(sp.sort);

  const data = await getAffiliateAdminPage(page, sort);
  const totalPages = Math.max(1, Math.ceil(data.total / ADMIN_AFFILIATE_PER_PAGE));

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Affiliate (admin)"
        description="System-wide overview of `short_links` plus referral earnings from `sold_items`."
        badge={{ label: `${data.totals.links_total} link${data.totals.links_total === 1 ? "" : "s"}` }}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">{money(data.totals.earned)}</p>
            <p className="text-xs text-muted-foreground">{data.totals.sold_count} referred sales</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total clicks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">{data.totals.clicks}</p>
            <p className="text-xs text-muted-foreground">{data.totals.links_total} active links</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active partners
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">{data.totals.links_active}</p>
            <p className="text-xs text-muted-foreground">unique users with at least one link</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-semibold">Links</CardTitle>
          <div className="flex flex-wrap gap-1">
            {SORT_LABELS.map((s) => (
              <Button
                key={s.id}
                size="sm"
                variant={sort === s.id ? "default" : "outline"}
                asChild
              >
                <Link href={`/adminzone/affiliate?sort=${s.id}`}>{s.label}</Link>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No affiliate links yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[100px]">Link</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Redirect</TableHead>
                    <TableHead className="w-[80px] text-right">Clicks</TableHead>
                    <TableHead className="w-[120px] text-right">Earned</TableHead>
                    <TableHead className="w-[100px]">Created</TableHead>
                    <TableHead className="w-[140px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <code className="text-xs font-medium">{row.link}</code>
                          {row.tag_tracking ? (
                            <Badge variant="outline" className="w-fit text-[10px]">
                              tag: {row.tag_tracking}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.bind_name ?? `#${row.bind_id}`}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {row.redirect}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{row.views}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {money(row.ref_earn_sum)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.created_date}</TableCell>
                      <TableCell className="text-right">
                        <AffiliateRowActions id={row.id} deleted={Boolean(row.deleted_at)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <AdminPagination
            page={page}
            totalPages={totalPages}
            hrefFor={(p) => `/adminzone/affiliate?page=${p}&sort=${sort}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
