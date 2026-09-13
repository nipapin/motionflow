"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { affiliateMoney } from "@/lib/affiliate/format";

export interface DuePayoutItem {
  affiliateId: number;
  affiliateName: string;
  affiliateEmail: string;
  affiliateStatus: "active" | "inactive";
  payoneerEmail: string | null;
  amount: number;
  periodStart: string;
  periodLabel: string;
}

/** Due list with the manual "Mark as paid" action — there is no Payoneer automation. */
export function PartnerPayoutsDueTable({ rows }: { rows: DuePayoutItem[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const markPaid = async (row: DuePayoutItem) => {
    setPendingId(row.affiliateId);
    try {
      const res = await fetch("/api/partners/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliateId: row.affiliateId,
          periodStart: row.periodStart,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        amount?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.message ?? data.error ?? "Could not mark as paid");
        return;
      }
      toast.success(
        `${row.affiliateName}: ${affiliateMoney(data.amount ?? row.amount)} marked as paid`,
      );
      router.refresh();
    } catch (err) {
      console.error("[partner-payouts]", err);
      toast.error("Network error. Try again.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Partner</TableHead>
          <TableHead>Payoneer</TableHead>
          <TableHead>Period</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.affiliateId}>
            <TableCell>
              <Link
                href={`/profile/partners/${row.affiliateId}`}
                className="font-medium text-foreground hover:text-blue-400"
              >
                {row.affiliateName}
              </Link>
              <p className="text-xs text-muted-foreground">{row.affiliateEmail}</p>
            </TableCell>
            <TableCell>
              {row.payoneerEmail ? (
                <span className="text-sm">{row.payoneerEmail}</span>
              ) : (
                <Badge variant="secondary">no Payoneer</Badge>
              )}
            </TableCell>
            <TableCell className="text-sm">
              {row.periodLabel}
              {row.affiliateStatus === "inactive" ? (
                <span className="block text-xs text-muted-foreground">partner inactive</span>
              ) : null}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums text-emerald-500">
              {affiliateMoney(row.amount)}
            </TableCell>
            <TableCell className="text-right">
              <Button
                size="sm"
                disabled={pendingId === row.affiliateId}
                onClick={() => void markPaid(row)}
              >
                {pendingId === row.affiliateId ? "Saving…" : "Mark as paid"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
