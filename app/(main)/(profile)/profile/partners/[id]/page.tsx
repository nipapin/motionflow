import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Receipt } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { getAffiliateById } from "@/lib/affiliate/db";
import {
  affiliateDate,
  affiliateMoney,
  affiliateRecurringLabel,
  affiliateSourceLabel,
} from "@/lib/affiliate/format";
import { affiliateRefLink } from "@/lib/affiliate/shared";
import {
  affiliatePeriodStats,
  listAffiliateCommissionRows,
  resolveAffiliatePeriod,
} from "@/lib/affiliate/stats";
import { PARTNERS_TABS } from "@/lib/affiliate/tabs";
import { AffiliateCopyLink } from "@/components/affiliate-copy-link";
import { AffiliatePeriodFilter } from "@/components/affiliate-period-filter";
import { AffiliateSectionTabs } from "@/components/affiliate-section-tabs";
import { AffiliateSummaryTile } from "@/components/affiliate-summary-tile";
import { PartnerSettingsForm } from "@/components/partner-settings-form";
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
  title: "Partner",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PartnerDetailPage({ params, searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isAffiliateAdmin(user)) redirect("/profile");

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const affiliate = await getAffiliateById(id);
  if (!affiliate) notFound();

  const sp = await searchParams;
  const period = resolveAffiliatePeriod(single(sp.date), single(sp.from), single(sp.to));
  const basePath = `/profile/partners/${affiliate.id}`;

  const [stats, rows] = await Promise.all([
    affiliatePeriodStats(affiliate, period),
    listAffiliateCommissionRows({ affiliateId: affiliate.id, period }),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/profile/partners"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Partners
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{affiliate.name}</h1>
          <Badge variant={affiliate.status === "active" ? "default" : "secondary"}>
            {affiliate.status === "active" ? "Active" : "Inactive"}
          </Badge>
          <Badge variant="outline">{affiliate.commissionPercent}%</Badge>
          <Badge variant="outline">{affiliateRecurringLabel(affiliate.recurringMode)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{affiliate.email}</span>
          {affiliate.socialUrl ? (
            <a
              href={affiliate.socialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {affiliate.socialUrl}
            </a>
          ) : null}
          <span>Joined {affiliateDate(affiliate.createdAt)}</span>
          {affiliate.userId == null ? <span>Invite pending</span> : null}
          <span>
            Payoneer: {affiliate.payoneerEmail ?? "not set by partner"}
          </span>
        </div>
      </div>

      <AffiliateSectionTabs tabs={PARTNERS_TABS} activeHref="/profile/partners" />

      <AffiliateCopyLink link={affiliateRefLink(affiliate.slug)} className="max-w-xl" />

      <AffiliatePeriodFilter
        basePath={basePath}
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
          <CardTitle className="text-base">Referred payments</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
              <Receipt className="h-8 w-8 text-blue-400" />
              <p className="font-medium text-foreground">No payments in this period</p>
              <p className="text-sm text-muted-foreground">
                Income appears here as soon as a referred visitor pays for a Motion Flow plan.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Paddle fee</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead>Date (UTC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{row.buyerEmail ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        registered {affiliateDate(row.buyerRegisteredAt)}
                      </p>
                    </TableCell>
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
                    <TableCell className="text-right tabular-nums">
                      {affiliateMoney(row.grossAmount, row.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">
                      −{affiliateMoney(Math.abs(row.paddleFee), row.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {affiliateMoney(row.netAmount, row.currency)}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <PartnerSettingsForm affiliate={affiliate} />
        </CardContent>
      </Card>
    </div>
  );
}
