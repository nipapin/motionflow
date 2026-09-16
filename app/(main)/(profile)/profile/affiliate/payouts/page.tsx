import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getAffiliateForUser } from "@/lib/affiliate/db";
import { affiliateDate, affiliateMoney } from "@/lib/affiliate/format";
import {
  currentMonthPeriod,
  commissionTotalForPeriod,
  listAffiliateStatements,
  PAYOUT_DAY_OF_MONTH,
} from "@/lib/affiliate/payouts";
import { AFFILIATE_TABS } from "@/lib/affiliate/tabs";
import { AffiliatePayoneerForm } from "@/components/affiliate-payoneer-form";
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
  title: "Affiliate payouts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AffiliatePayoutsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const affiliate = await getAffiliateForUser(user);
  if (!affiliate) redirect("/profile");

  const thisMonth = currentMonthPeriod();
  const [statements, accruingNow] = await Promise.all([
    listAffiliateStatements(affiliate.id),
    commissionTotalForPeriod(affiliate.id, thisMonth),
  ]);

  const pendingTotal = statements
    .filter((statement) => statement.status === "pending")
    .reduce((sum, statement) => sum + statement.amount, 0);
  const paidTotal = statements
    .filter((statement) => statement.status === "paid")
    .reduce((sum, statement) => sum + statement.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
        <p className="text-muted-foreground">
          Payouts go out in the middle of each month (around the {PAYOUT_DAY_OF_MONTH}th) for the
          previous calendar month. Periods are UTC.
        </p>
      </div>

      <AffiliateSectionTabs tabs={AFFILIATE_TABS} activeHref="/profile/affiliate/payouts" />

      <div className="grid gap-3 sm:grid-cols-3">
        <AffiliateSummaryTile
          title="Accruing now"
          value={affiliateMoney(accruingNow)}
          hint={`${thisMonth.label} · paid next cycle`}
        />
        <AffiliateSummaryTile
          title="Awaiting payout"
          value={affiliateMoney(pendingTotal)}
          hint="closed months not paid yet"
        />
        <AffiliateSummaryTile
          title="Paid to you"
          value={affiliateMoney(paidTotal)}
          hint="all time"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout details</CardTitle>
        </CardHeader>
        <CardContent>
          <AffiliatePayoneerForm payoneerEmail={affiliate.payoneerEmail} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statements</CardTitle>
        </CardHeader>
        <CardContent>
          {statements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
              <Wallet className="h-8 w-8 text-blue-400" />
              <p className="font-medium text-foreground">No statements yet</p>
              <p className="text-sm text-muted-foreground">
                A statement appears once a month closes with income on it.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid at (UTC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((statement) => (
                  <TableRow key={statement.periodStart}>
                    <TableCell className="font-medium">{statement.periodLabel}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {affiliateMoney(statement.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statement.status === "paid" ? "default" : "secondary"}>
                        {statement.status === "paid" ? "Paid" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {statement.status === "paid" ? affiliateDate(statement.paidAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {affiliate.payoneerEmail ? null : (
        <p className="text-sm text-muted-foreground">
          Add your Payoneer email above so we can send your next payout.
        </p>
      )}
    </div>
  );
}
