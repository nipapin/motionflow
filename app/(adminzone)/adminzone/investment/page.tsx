import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { buildInvestmentCharts, getInvestmentTransactionsPage } from "@/lib/admin/investment";
import { AdminDonutChart } from "@/components/admin/charts/admin-donut-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Investment — Admin",
};

export const dynamic = "force-dynamic";

const PER = 24;

type PageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminInvestmentPage({ searchParams }: PageProps) {
  const user = ensureInvestor(await getSessionUser());
  const isAdmin = user.access === 100;
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [charts, { rows, total }] = await Promise.all([
    buildInvestmentCharts(user.id, isAdmin),
    getInvestmentTransactionsPage(isAdmin ? null : user.id, page),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PER));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Investment analytics</p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Portfolio overview</h2>
            {isAdmin ? (
              <Badge variant="secondary">Admin view</Badge>
            ) : (
              <Badge variant="outline">Personal</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Investors (setup %)</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminDonutChart labels={charts.investors.labels} data={charts.investors.data} emptyLabel="No setup rows" />
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Capital allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminDonutChart labels={charts.allocations.labels} data={charts.allocations.data} />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows yet.</p>
          ) : (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[72px]">ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={String(r.id)}>
                      <TableCell className="font-mono text-xs">{String(r.id)}</TableCell>
                      <TableCell className="text-sm">{String(r.status ?? "")}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{String(r.amount ?? "")}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                        {String(r.content ?? "")}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {r.created_at ? String(r.created_at) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex justify-center gap-2">
              {page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/adminzone/investment?page=${page - 1}`}>Previous</Link>
                </Button>
              ) : null}
              <span className="flex items-center px-2 text-sm text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/adminzone/investment?page=${page + 1}`}>Next</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
