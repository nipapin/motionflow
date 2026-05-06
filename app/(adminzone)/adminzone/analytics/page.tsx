import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { getSubscriptionAnalytics } from "@/lib/admin/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AdminSectionHeader } from "@/components/admin/admin-section-header";

export const metadata: Metadata = { title: "Analytics — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ see?: string }> };

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(n);
}

export default async function AdminAnalyticsPage({ searchParams }: PageProps) {
  ensureInvestor(await getSessionUser());
  const sp = await searchParams;
  const see = sp.see ?? "";

  let stats: Awaited<ReturnType<typeof getSubscriptionAnalytics>> | null = null;
  let loadError: string | null = null;
  try {
    stats = await getSubscriptionAnalytics();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Query failed";
  }

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title="Subscription analytics"
        description="Mirrors Laravel `Admin\\Analytics` — aggregates `subscription_systems` + `subscription_downloads` for the current month."
        badge={stats ? { label: stats.monthLabel } : undefined}
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant={see === "" ? "default" : "outline"}>
              <Link href="/adminzone/analytics">Overview</Link>
            </Button>
            <Button asChild size="sm" variant={see === "subscription_group_author" ? "default" : "outline"}>
              <Link href="/adminzone/analytics?see=subscription_group_author">Per author</Link>
            </Button>
          </div>
        }
      />

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Could not load analytics: {loadError}
        </p>
      ) : null}

      {stats && see === "" ? (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Subscription summary</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.table.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="text-sm">{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium">
                      {row.value}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {stats && see === "subscription_group_author" ? (
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Income per author (current month)</CardTitle>
            <Badge variant="outline">{stats.perAuthor.length} author{stats.perAuthor.length === 1 ? "" : "s"}</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {stats.perAuthor.length === 0 ? (
              <p className="text-sm text-muted-foreground">No author downloads in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[80px]">User ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Income</TableHead>
                    <TableHead className="text-right">Downloads</TableHead>
                    <TableHead className="text-right">Avg weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.perAuthor.map((row) => (
                    <TableRow key={row.author_id}>
                      <TableCell className="font-mono text-xs">{row.author_id}</TableCell>
                      <TableCell>{row.author_name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.income)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.downloads}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.average_weight)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
