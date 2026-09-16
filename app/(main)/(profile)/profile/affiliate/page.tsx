import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getAffiliateForUser, listAffiliateCampaigns } from "@/lib/affiliate/db";
import {
  affiliateDate,
  affiliateMoney,
  affiliateRecurringLabel,
  affiliateSourceLabel,
} from "@/lib/affiliate/format";
import {
  affiliatePeriodStats,
  listAffiliateCommissionRows,
  resolveAffiliatePeriod,
} from "@/lib/affiliate/stats";
import { AFFILIATE_TABS } from "@/lib/affiliate/tabs";
import { AffiliateCampaignLinks } from "@/components/affiliate-campaign-links";
import { AffiliatePeriodFilter } from "@/components/affiliate-period-filter";
import { AffiliateSectionTabs } from "@/components/affiliate-section-tabs";
import { AffiliateSummaryTile } from "@/components/affiliate-summary-tile";
import { Badge } from "@/components/ui/badge";
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
  title: "Affiliate",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AffiliateOverviewPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const affiliate = await getAffiliateForUser(user);
  if (!affiliate) redirect("/profile");

  const sp = await searchParams;
  const period = resolveAffiliatePeriod(single(sp.date), single(sp.from), single(sp.to));
  const [stats, rows, campaigns] = await Promise.all([
    affiliatePeriodStats(affiliate, period),
    listAffiliateCommissionRows({ affiliateId: affiliate.id, period }),
    listAffiliateCampaigns(affiliate.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Affiliate</h1>
        <p className="text-muted-foreground">
          You earn {affiliate.commissionPercent}% of every referred Motion Flow subscription
          payment, after the payment processing fee.
        </p>
      </div>

      <AffiliateSectionTabs tabs={AFFILIATE_TABS} activeHref="/profile/affiliate" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your referral link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <AffiliateCampaignLinks slug={affiliate.slug} campaigns={campaigns} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{affiliate.commissionPercent}% income</Badge>
            <Badge variant="outline">{affiliateRecurringLabel(affiliate.recurringMode)}</Badge>
            <Badge variant={affiliate.status === "active" ? "default" : "secondary"}>
              {affiliate.status === "active" ? "Active" : "Inactive"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Visitors are attributed for 30 days after clicking your link.
          </p>
        </CardContent>
      </Card>

      <AffiliatePeriodFilter
        basePath="/profile/affiliate"
        periodKey={period.key}
        from={period.from}
        to={period.to}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AffiliateSummaryTile title="Clicks" value={String(stats.clicks)} hint={period.label} />
        <AffiliateSummaryTile title="Signups" value={String(stats.signups)} hint={period.label} />
        <AffiliateSummaryTile title="Payments" value={String(stats.paymentsCount)} hint={period.label} />
        <AffiliateSummaryTile title="Subscribers" value={String(stats.buyersCount)} hint="unique buyers" />
        <AffiliateSummaryTile
          title="Income"
          value={affiliateMoney(stats.commissionTotal)}
          hint={period.label}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referred subscribers</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
              <Users className="h-8 w-8 text-blue-400" />
              <p className="font-medium text-foreground">Nothing in this period yet</p>
              <p className="text-sm text-muted-foreground">
                Share your link — referred subscriptions and your income show up here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscriber</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Your income</TableHead>
                  <TableHead>Date (UTC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.buyerEmail ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      <span className="text-foreground">{row.plan ?? "—"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {row.billingPeriod ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.campaign ? "default" : "outline"}>
                        {affiliateSourceLabel(row.campaign, row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={
                        row.commissionAmount < 0
                          ? "text-right font-medium tabular-nums text-destructive"
                          : "text-right font-medium tabular-nums text-emerald-500"
                      }
                    >
                      {affiliateMoney(row.commissionAmount, row.currency)}
                    </TableCell>
                    <TableCell className="text-sm">{affiliateDate(row.createdAt)}</TableCell>
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
