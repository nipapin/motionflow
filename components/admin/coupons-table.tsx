"use client";

import * as React from "react";
import type { CouponRow } from "@/lib/admin/coupons";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CouponRowActions } from "@/components/admin/coupons-row-actions";

function discountLabel(type: string, amount: number): string {
  if (type === "percent") return `${amount}%`;
  if (type === "fixed") return `$${amount}`;
  return `−$${amount}`;
}

function periodLabel(start: string | null, end: string | null): string {
  if (!start && !end) return "Anytime";
  const fmt = (s: string | null) => (s ? s.slice(0, 10) : "—");
  return `${fmt(start)} → ${fmt(end)}`;
}

export function CouponsTable({ rows }: { rows: CouponRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        No coupons yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[64px]">ID</TableHead>
            <TableHead>Code</TableHead>
            <TableHead className="w-[120px]">Discount</TableHead>
            <TableHead className="w-[140px]">Coverage</TableHead>
            <TableHead>Active period</TableHead>
            <TableHead className="w-[110px]">Uses</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead className="w-[180px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.id}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <code className="text-sm font-semibold">{row.code}</code>
                  {row.comment ? (
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">{row.comment}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-sm tabular-nums">{discountLabel(row.type, row.amount)}</TableCell>
              <TableCell className="text-xs">
                {row.assigned_id === 0 ? (
                  <Badge variant="outline">Global</Badge>
                ) : (
                  <Badge variant="secondary">item #{row.assigned_id}</Badge>
                )}
                {row.priority ? (
                  <Badge variant="outline" className="ml-1 border-primary/40 text-primary">
                    priority
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {periodLabel(row.start_date, row.end_date)}
              </TableCell>
              <TableCell className="text-xs tabular-nums">
                {row.uses}
                {row.max_uses != null ? ` / ${row.max_uses}` : " / ∞"}
              </TableCell>
              <TableCell>
                <Badge variant={row.status === 1 ? "default" : "secondary"} className="text-[10px]">
                  {row.status === 1 ? "Enabled" : "Disabled"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <CouponRowActions id={row.id} status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
