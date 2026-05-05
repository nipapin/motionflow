import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getCompletedPayoutInvoice } from "@/lib/author/payouts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

function money(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Payout invoice #${id}` };
}

export default async function PayoutInvoicePage({ params }: PageProps) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const { id } = await params;
  const payoutId = Number(id);
  if (!Number.isFinite(payoutId)) notFound();

  const row = await getCompletedPayoutInvoice(user.id, payoutId);
  if (!row) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payout invoice #{row.id}</h1>
        <p className="text-sm text-muted-foreground">
          Issued {format(new Date(row.createdAt), "d MMM yyyy")} — completed payout.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Amounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Total</span>
            <span className="font-semibold text-emerald-600">{money(row.amount)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>From direct sales balance</span>
            <span>{money(row.soldAmount)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>From subscription balance</span>
            <span>{money(row.subsAmount)}</span>
          </div>
          {row.subsBonus != null && row.subsBonus !== 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>Subscription bonus</span>
              <span>{money(row.subsBonus)}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
