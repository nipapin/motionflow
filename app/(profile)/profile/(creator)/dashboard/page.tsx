import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { Bookmark, DollarSign, Infinity, ShoppingCart, Trophy, UserPlus } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getDashboardStats } from "@/lib/author/dashboard-stats";
import { StatCard } from "@/components/author/stat-card";
import { CategoryDonut } from "@/components/author/category-donut";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function AuthorDashboardPage() {
  const user = await getSessionUser();
  if (!user) return null;
  const stats = await getDashboardStats(user.id);

  const announce = stats.announces as { title?: string; body?: string; link?: string } | null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Contributor overview — same data as the legacy Laravel panel.</p>
      </div>

      {announce?.title ? (
        <Alert className="border-blue-500/40 bg-blue-500/5">
          <Infinity className="h-4 w-4 text-pink-500" />
          <AlertTitle>{announce.title}</AlertTitle>
          <AlertDescription className="space-y-1">
            {typeof announce.body === "string" ? <p>{announce.body}</p> : null}
            {announce.link ? (
              <Link href={announce.link} className="text-primary underline-offset-4 hover:underline">
                See more
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Earnings (balance)" value={money(stats.balance)} icon={DollarSign} />
        <StatCard title="Bookmarks" value={String(stats.inFavorites)} icon={Bookmark} />
        <StatCard title="Achievements" value={String(stats.receivedBadges)} icon={Trophy} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Direct Sales</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Today</span>
              <span className="font-medium tabular-nums">
                {money(stats.earnSales.today.earned)} / {stats.earnSales.today.count} sales
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Current month</span>
              <span className="font-medium tabular-nums">
                {money(stats.earnSales.month.earned)} / {stats.earnSales.month.count} sales
              </span>
            </div>
            <Button variant="link" className="h-auto px-0 text-primary" asChild>
              <Link href="/profile/earnings/sales">Explore</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Downloads by subscription</CardTitle>
            <Infinity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Today</span>
              <span className="font-medium">{stats.earnSubscription.todayCount} items</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Current month</span>
              <span className="font-medium tabular-nums">
                {money(stats.earnSubscription.month.earned)} / {stats.earnSubscription.month.count} items
              </span>
            </div>
            <Button variant="link" className="h-auto px-0 text-primary" asChild>
              <Link href="/profile/earnings/subscription">Explore</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/60 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Affiliate</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Today</span>
              <span className="font-medium tabular-nums">
                {money(stats.earnAffiliate.today.earned)} / {stats.earnAffiliate.today.count}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Current month</span>
              <span className="font-medium tabular-nums">
                {money(stats.earnAffiliate.month.earned)} / {stats.earnAffiliate.month.count}
              </span>
            </div>
            <Button variant="link" className="h-auto px-0 text-primary" asChild>
              <Link href="/profile/affiliate">Explore</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Latest search queries</CardTitle>
            <Button variant="link" className="h-auto px-0 text-primary" asChild>
              <Link href="/profile/marketing/search-queries">Explore</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Elements</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.popularSearchQueries.map((q, i) => (
                  <TableRow key={`${q.query}-${i}`}>
                    <TableCell className="max-w-[200px] truncate font-medium">{q.query}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {q.section}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{q.found}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-primary tabular-nums">{q.views}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Data from marketplace search analytics. Linked categories follow your catalog slugs.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Your items</CardTitle>
            <Button variant="link" className="h-auto px-0 text-primary" asChild>
              <Link href="/profile/items">Go to items</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">New this month</span>
              <span className="font-semibold tabular-nums">{stats.newItemsThisMonth}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total published</span>
              <span className="font-semibold tabular-nums">{stats.itemsTotalPublished}</span>
            </div>
            <CategoryDonut data={stats.categoryChart} />
            <p className="text-xs text-muted-foreground">
              Only items with <code className="rounded bg-muted px-1">access = 1</code> (published). Updated{" "}
              {format(new Date(), "PPp")}.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
