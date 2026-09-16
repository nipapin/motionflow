import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Wallet } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { isAffiliateAdmin } from "@/lib/affiliate/admin";
import { affiliateDate, affiliateMoney } from "@/lib/affiliate/format";
import {
  listDuePayouts,
  listPayoutHistory,
  monthLabelFromDate,
  PAYOUT_DAY_OF_MONTH,
  previousMonthPeriod,
} from "@/lib/affiliate/payouts";
import { PARTNERS_TABS } from "@/lib/affiliate/tabs";
import { AffiliateSectionTabs } from "@/components/affiliate-section-tabs";
import { PartnerPayoutsDueTable } from "@/components/partner-payouts-due-table";
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
  title: "Partner payouts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function PartnerPayoutsPage({ searchParams }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!isAffiliateAdmin(user)) redirect("/profile");

  const { tab } = await searchParams;
  const activeTab = tab === "paid" ? "paid" : "due";
  const period = previousMonthPeriod();
  const [due, history] = await Promise.all([listDuePayouts(period), listPayoutHistory()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Partner payouts</h1>
        <p className="text-muted-foreground">
          Paid on the {PAYOUT_DAY_OF_MONTH}th for the previous calendar month. Periods and dates
          are UTC. Transfers are made manually in Payoneer, then marked here.
        </p>
      </div>

      <AffiliateSectionTabs tabs={PARTNERS_TABS} activeHref="/profile/partners/payouts" />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={activeTab === "due" ? "default" : "outline"} asChild>
          <Link href="/profile/partners/payouts?tab=due">Due ({due.length})</Link>
        </Button>
        <Button size="sm" variant={activeTab === "paid" ? "default" : "outline"} asChild>
          <Link href="/profile/partners/payouts?tab=paid">Paid ({history.length})</Link>
        </Button>
      </div>

      {activeTab === "due" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Due for {period.label}</CardTitle>
          </CardHeader>
          <CardContent>
            {due.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
                <Wallet className="h-8 w-8 text-blue-400" />
                <p className="font-medium text-foreground">Nothing due for {period.label}</p>
                <p className="text-sm text-muted-foreground">
                  Either no income was accrued or every partner is already paid.
                </p>
              </div>
            ) : (
              <PartnerPayoutsDueTable
                rows={due.map((row) => ({
                  affiliateId: row.affiliateId,
                  affiliateName: row.affiliateName,
                  affiliateEmail: row.affiliateEmail,
                  affiliateStatus: row.affiliateStatus,
                  payoneerEmail: row.payoneerEmail,
                  amount: row.amount,
                  periodStart: row.period.start,
                  periodLabel: row.period.label,
                }))}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payout history</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
                <BadgeCheck className="h-8 w-8 text-blue-400" />
                <p className="font-medium text-foreground">No payouts yet</p>
                <p className="text-sm text-muted-foreground">
                  Once you mark a month as paid it shows up here for both sides.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Paid at (UTC)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell>
                        <Link
                          href={`/profile/partners/${payout.affiliateId}`}
                          className="font-medium text-foreground hover:text-blue-400"
                        >
                          {payout.affiliateName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {payout.payoneerEmail ?? payout.affiliateEmail}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {monthLabelFromDate(payout.periodStart)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {affiliateMoney(payout.amount)}
                      </TableCell>
                      <TableCell className="text-sm">{affiliateDate(payout.paidAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
