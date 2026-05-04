import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { Bell, Coins, Settings } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import {
  getAwaitingPayoutSum,
  getPayoutsPage,
  getUserPayoutProfile,
  nextScheduledPayoutDate,
  payoutStatusLabel,
  formatPayoutDisplayDate,
} from "@/lib/author/payouts";
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
  title: "Payouts",
};

export const dynamic = "force-dynamic";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function methodLabel(m: string | null): string {
  if (!m) return "Not set";
  if (m === "payproglobal") return "PayPro Global (by request)";
  if (m === "paypal") return "PayPal";
  if (m === "payoneer") return "Payoneer";
  if (m === "swift") return "Bank (SWIFT)";
  return m;
}

export default async function PayoutsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const [profile, awaiting, { rows }] = await Promise.all([
    getUserPayoutProfile(user.id),
    getAwaitingPayoutSum(user.id),
    getPayoutsPage(user.id, { page: 1, perPage: 30 }),
  ]);

  const nextPay = nextScheduledPayoutDate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
        <p className="text-muted-foreground">History and upcoming transfers from your marketplace balance.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Alert className="border-amber-500/30 bg-amber-500/5 lg:col-span-1">
          <Bell className="h-4 w-4" />
          <AlertTitle>Upcoming payout</AlertTitle>
          <AlertDescription>
            Your pending total of <strong>{money(awaiting)}</strong> is scheduled around{" "}
            <strong>{format(nextPay, "d MMM yyyy")}</strong> (per legacy schedule).
          </AlertDescription>
        </Alert>
        <Card className="border-border/60 lg:col-span-1">
          <CardContent className="flex items-center gap-3 p-4">
            <Coins className="h-8 w-8 text-primary" />
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">Min. withdraw</p>
              <p className="text-lg font-semibold">{money(profile?.withdrawMinAmount ?? 50)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment method</CardTitle>
            <Button size="sm" variant="outline" asChild>
              <Link href="/profile/payouts/setup">
                <Settings className="mr-1 h-4 w-4" />
                Change method
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{methodLabel(profile?.withdrawMethod ?? null)}</p>
            <p className="text-xs text-muted-foreground">Balance: {money(profile?.balance ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payout history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">By subscription</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const st = payoutStatusLabel(p.status);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id}</TableCell>
                    <TableCell>
                      <Badge variant={st.tone === "success" ? "default" : "secondary"}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px] text-sm">
                      {p.status === 0 ? (
                        <span>Awaiting payout on {methodLabel(p.method)}</span>
                      ) : (
                        <span>Sent via {methodLabel(p.method)}</span>
                      )}
                      {p.status === 1 ? (
                        <div>
                          <Link href={`/profile/payouts/invoice/${p.id}`} className="text-primary hover:underline">
                            See payout invoice #{p.id}
                          </Link>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-600">{money(p.amount)}</TableCell>
                    <TableCell className="text-right text-primary tabular-nums">{money(p.soldAmount)}</TableCell>
                    <TableCell className="text-right text-primary tabular-nums">{money(p.subsAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatPayoutDisplayDate(p.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
