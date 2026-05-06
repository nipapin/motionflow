import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart, Infinity as InfinityIcon, DollarSign, Users, Mail, LifeBuoy } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ensureInvestor } from "@/lib/auth/access-control";
import { getAdminDashboardData } from "@/lib/admin/dashboard-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminDonutChart } from "@/components/admin/charts/admin-donut-chart";
import { AdminHorizontalBarChart } from "@/components/admin/charts/admin-bar-chart";

export const metadata: Metadata = {
  title: "Dashboard — Admin",
};

export const dynamic = "force-dynamic";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default async function AdminDashboardPage() {
  const user = ensureInvestor(await getSessionUser());
  const d = await getAdminDashboardData(user.id);

  const rs = d.requestsStats;
  const business = rs.business_contact ?? 0;
  const support = rs.support_contact ?? 0;
  const invites = rs.become_author_request ?? 0;
  const bugs = rs.bug_report ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Net monthly profits</p>
          <div className="mt-1 flex flex-wrap gap-6 text-sm">
            <span>
              Sales{" "}
              <strong className="tabular-nums text-primary">{money(d.marketProfit.monthly.sales_earn)}</strong>
            </span>
            <span>
              Subscription{" "}
              <strong className="tabular-nums text-primary">{money(d.marketProfit.monthly.subscription_earn)}</strong>
            </span>
            <span>
              Refund loss{" "}
              <strong className="tabular-nums text-destructive">{money(d.marketProfit.monthly.refund_loss)}</strong>
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/adminzone/items_access/wait">Moderate items</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Subscriptions (active)</CardTitle>
            <InfinityIcon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <AdminDonutChart labels={d.chartSubscriptionActive.labels} data={d.chartSubscriptionActive.data} />
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between gap-2">
                <span>Active total</span>
                <span className="tabular-nums font-medium text-foreground">
                  {money(d.subsStats.amount_active_status ?? 0)} / {d.subsStats.count_active_status ?? 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-semibold">Direct sales (month)</CardTitle>
            <ShoppingCart className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <AdminDonutChart labels={d.chartDirectSales.labels} data={d.chartDirectSales.data} />
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between gap-2">
                <span>Sold net</span>
                <span className="tabular-nums font-medium text-foreground">{money(d.directStats.sold_net ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Authors + affiliates</span>
                <span className="tabular-nums font-medium text-foreground">{money(d.directStats.authors_earn ?? 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              Payouts (month)
              <Badge variant={d.payouts_enabled ? "default" : "secondary"}>{d.payouts_enabled ? "Enabled" : "Disabled"}</Badge>
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <AdminHorizontalBarChart labels={d.chartPayouts.labels} data={d.chartPayouts.data} />
            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>Total success</span>
              <span className="tabular-nums font-medium text-foreground">
                {money(d.payouts_success_total.amount)} / {d.payouts_success_total.count}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              Marketplace items
              <Link href="/adminzone/items_access/wait" className="text-xs font-medium text-primary hover:underline">
                Open
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">All</span>
              <span className="font-semibold tabular-nums">
                {d.stats.all}
                {d.stats.processing_items ? (
                  <sup className="ml-1 text-xs text-muted-foreground">/ {d.stats.processing_items} processing</sup>
                ) : null}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-emerald-600 dark:text-emerald-400">
              <span>Approved</span>
              <span className="font-semibold tabular-nums">{d.stats.approved_items}</span>
            </div>
            <div className="flex justify-between gap-2 text-primary">
              <span>Pending</span>
              <span className="font-semibold tabular-nums">{d.stats.wait_approval_items}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Soft / hard</span>
              <span className="font-semibold tabular-nums">
                {d.stats.soft_reject_items} / <span className="text-destructive">{d.stats.rejected_items}</span>
              </span>
            </div>
            <div className="flex justify-between gap-2 text-destructive">
              <span>Blocked</span>
              <span className="font-semibold tabular-nums">{d.stats.blocked_items}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-semibold">
              <span className="inline-flex items-center gap-2">
                <LifeBuoy className="size-4" aria-hidden />
                Requests
              </span>
              <Link href="/adminzone/requests" className="text-xs font-medium text-primary hover:underline">
                Open
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className={`flex justify-between gap-2 ${d.requestsStatsAssigned ? "text-destructive" : "text-muted-foreground"}`}>
              <span>Assigned to you</span>
              <span className="font-semibold tabular-nums">{d.requestsStatsAssigned}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Business</span>
              <span className="font-semibold tabular-nums text-primary">{business}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Support</span>
              <span className="font-semibold tabular-nums text-primary">{support}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Invites</span>
              <span className="font-semibold tabular-nums text-primary">{invites}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Bugs</span>
              <span className="font-semibold tabular-nums text-primary">{bugs}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Users className="size-4" aria-hidden />
              Users
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Buyers</span>
              <span className="font-semibold tabular-nums">
                {d.userStats.users}
                {d.userStats.new_users ? (
                  <sup className="ml-1 text-xs text-primary">+{d.userStats.new_users} today</sup>
                ) : null}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Partners</span>
              <span className="font-semibold tabular-nums">{d.userStats.partners}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Authors</span>
              <span className="font-semibold tabular-nums">
                {d.userStats.authors}{" "}
                <sup className="text-xs text-primary">/ {d.userStats.p_authors} priority</sup>
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Staff</span>
              <span className="font-semibold tabular-nums">{d.userStats.staffs}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Admins</span>
              <span className="font-semibold tabular-nums">{d.userStats.admins}</span>
            </div>
            <div className="flex justify-between gap-2 border-t border-border/50 pt-2">
              <span className="text-muted-foreground">Author balances</span>
              <span className="font-semibold tabular-nums text-primary">{money(d.userStats.author_balances)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="size-4" aria-hidden />
              Emails
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Newsletter</span>
              <span className="font-semibold tabular-nums">{d.emailsBase.newsletter}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Freebies</span>
              <span className="font-semibold tabular-nums">{d.emailsBase.freebies}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
