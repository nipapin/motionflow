"use client";

import * as React from "react";
import type { OfferRow } from "@/lib/admin/offers";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OfferRowActions } from "@/components/admin/offer-row-actions";

const TONE_VARIANT: Record<OfferRow["status_tone"], "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  scheduled: "outline",
  finished: "secondary",
  draft: "secondary",
};

export function OffersTable({ rows }: { rows: OfferRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        No offers yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[64px]">ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-[110px]">Type</TableHead>
            <TableHead className="w-[160px]">Status</TableHead>
            <TableHead className="w-[100px]">Visible</TableHead>
            <TableHead className="w-[100px]">Updated</TableHead>
            <TableHead className="w-[160px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.id}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{row.short_title || row.title}</span>
                  <span className="text-[11px] text-muted-foreground">/{row.slug}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {row.type}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={TONE_VARIANT[row.status_tone]} className="text-[10px]">
                  {row.status_label}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={row.visible === 1 ? "default" : "secondary"} className="text-[10px]">
                  {row.visible === 1 ? "Live" : "Hidden"}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums">{row.updated_date}</TableCell>
              <TableCell className="text-right">
                <OfferRowActions id={row.id} visible={row.visible === 1} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
