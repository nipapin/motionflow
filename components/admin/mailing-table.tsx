"use client";

import * as React from "react";
import {
  MAILING_RECIPIENTS,
  MAILING_TYPES,
  type MailingRow,
} from "@/lib/admin/mailing";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MailingRowActions } from "@/components/admin/mailing-row-actions";

const TONE_VARIANT: Record<MailingRow["status_tone"], "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  scheduled: "outline",
  finished: "secondary",
  draft: "secondary",
  completed: "default",
};

export function MailingTable({ rows }: { rows: MailingRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        No mailings yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[64px]">ID</TableHead>
            <TableHead>Title / subject</TableHead>
            <TableHead className="w-[160px]">Type</TableHead>
            <TableHead className="w-[180px]">Recipients</TableHead>
            <TableHead className="w-[110px] text-right">Audience</TableHead>
            <TableHead className="w-[160px]">Status</TableHead>
            <TableHead className="w-[160px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.id}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{row.title}</span>
                  {row.subject ? (
                    <span className="text-[11px] text-muted-foreground">{row.subject}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">
                  {MAILING_TYPES[row.type] ?? row.type}
                </Badge>
                {row.auto_type_picks ? (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    auto-picks
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {MAILING_RECIPIENTS[row.recipients] ?? row.recipients}
              </TableCell>
              <TableCell className="text-right text-xs tabular-nums">
                {row.parsed_emails ?? "?"}
                {row.max_emails ? ` / ${row.max_emails}` : ""}
              </TableCell>
              <TableCell>
                <Badge variant={TONE_VARIANT[row.status_tone]} className="text-[10px]">
                  {row.status_label}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <MailingRowActions id={row.id} isSent={row.status === 1} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
