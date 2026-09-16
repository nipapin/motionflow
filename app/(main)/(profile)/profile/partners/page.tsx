import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import {
  adminAffiliateSummary,
  listAdminAffiliateRows,
  resolveAffiliatePeriod,
} from "@/lib/affiliate/stats";
import { affiliateMoney, affiliateRecurringLabel } from "@/lib/affiliate/format";
import { affiliateRefLink } from "@/lib/affiliate/shared";
import { AffiliateCopyLink } from "@/components/affiliate-copy-link";
import { AffiliatePeriodFilter } from "@/components/affiliate-period-filter";
import { AffiliateSectionTabs } from "@/components/affiliate-section-tabs";
import { AffiliateSummaryTile } from "@/components/affiliate-summary-tile";
import { PARTNERS_TABS } from "@/lib/affiliate/tabs";
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
  title: "Partners",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isAffiliateAdmin(user)) redirect("/profile");

  const sp = await searchParams;
  const period = resolveAffiliatePeriod(single(sp.date), single(sp.from), single(sp.to));
  const [summary, partners] = await Promise.all([
    adminAffiliateSummary(period),
    listAdminAffiliateRows(period),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Partners</h1>
          <p className="text-muted-foreground">
            Subscription affiliates. Income is a share of each payment after the Paddle fee.
          </p>
        </div>
        <Button asChild>
          <Link href="/profile/partners/new">
            <Plus className="h-4 w-4" />
            <span className="ml-1.5">Create partner</span>
          </Link>
        </Button>
      </div>

      <AffiliateSectionTabs tabs={PARTNERS_TABS} activeHref="/profile/partners" />

      <AffiliatePeriodFilter
        basePath="/profile/partners"
        periodKey={period.key}
        from={period.from}
        to={period.to}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AffiliateSummaryTile
          title="Partners"
          value={`${summary.partnersActive} / ${summary.partnersTotal}`}
          hint="active / all"
        />
        <AffiliateSummaryTile
          title="Income accrued"
          value={affiliateMoney(summary.commissionTotal)}
          hint={period.label}
        />
        <AffiliateSummaryTile
          title="Paid out"
          value={affiliateMoney(summary.paidTotal)}
          hint="all time"
        />
        <AffiliateSummaryTile
          title="Referred subscribers"
          value={String(summary.buyersCount)}
          hint={`unique buyers · ${period.label}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All partners</CardTitle>
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
              <Users className="h-8 w-8 text-blue-400" />
              <div>
                <p className="font-medium text-foreground">No partners yet</p>
                <p className="text-sm text-muted-foreground">
                  Create one to generate a referral link and start tracking subscriptions.
                </p>
              </div>
              <Button asChild size="sm">
                <Link href="/profile/partners/new">Create partner</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Referral link</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead className="text-right">Referred</TableHead>
                  <TableHead className="text-right">Earned ({period.label})</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell>
                      <Link
                        href={`/profile/partners/${partner.id}`}
                        className="font-medium text-foreground hover:text-blue-400"
                      >
                        {partner.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{partner.email}</p>
                    </TableCell>
                    <TableCell>
                      <AffiliateCopyLink link={affiliateRefLink(partner.slug)} compact />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {partner.commissionPercent}%
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {affiliateRecurringLabel(partner.recurringMode)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {partner.buyersTotal}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-emerald-500">
                      {affiliateMoney(partner.earnedInPeriod)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={partner.status === "active" ? "default" : "secondary"}>
                          {partner.status === "active" ? "Active" : "Inactive"}
                        </Badge>
                        {partner.hasAccount ? null : (
                          <span className="text-xs text-muted-foreground">invite pending</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
