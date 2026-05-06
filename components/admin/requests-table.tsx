import Link from "next/link";
import { Paperclip } from "lucide-react";
import type { AdminRequestRow } from "@/lib/admin/requests";
import { AdminStatusBadge, type AdminModerationTone } from "@/components/admin/admin-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function rowStatusTone(row: AdminRequestRow): { label: string; tone: AdminModerationTone } {
  if (row.answered) {
    return { label: "Closed", tone: "closed" };
  }
  if (row.expect_resolve) {
    return { label: "Expect resolve", tone: "expect_resolve" };
  }
  return { label: "Awaiting", tone: "awaiting" };
}

export function RequestsTable({ rows }: { rows: AdminRequestRow[] }) {
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[72px]">ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Waiting</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const st = rowStatusTone(row);
            return (
              <TableRow key={row.id} className={row.answered ? "opacity-60" : undefined}>
                <TableCell className="font-mono text-sm tabular-nums">
                  <Link href={`/adminzone/requests/view?id=${row.id}`} className="text-primary hover:underline">
                    {row.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusBadge label={st.label} tone={st.tone} />
                    {row.attachments ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Paperclip className="size-3.5" aria-hidden />
                        Attachment
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {row.assigned_staff_name ? (
                    <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5">{row.assigned_staff_name}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {row.answered_staff_name ? (
                    <span className="mt-1 block text-xs text-muted-foreground">By {row.answered_staff_name}</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <AdminStatusBadge label={row.type_label} tone="neutral" />
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{row.wait_label || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
