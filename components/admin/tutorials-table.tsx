"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import type { TutorialItemRow } from "@/lib/admin/tutorials";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteTutorialAction, toggleTutorialVisibility } from "@/app/(adminzone)/_actions/tutorials";

export function TutorialsTable({ rows }: { rows: TutorialItemRow[] }) {
  const [busy, setBusy] = React.useState<number | null>(null);

  async function toggle(id: number, next: boolean) {
    setBusy(id);
    try {
      const r = await toggleTutorialVisibility(id, next);
      if (r.ok) toast.success(next ? "Published" : "Hidden");
      else toast.error(r.error ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this tutorial and its locales? This cannot be undone.")) return;
    setBusy(id);
    try {
      const r = await deleteTutorialAction(id);
      if (r.ok) toast.success("Tutorial deleted");
      else toast.error(r.error ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        No tutorials yet.
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
            <TableHead>Category</TableHead>
            <TableHead>Author</TableHead>
            <TableHead className="w-[120px]">Visibility</TableHead>
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
                  <span className="font-medium">{row.title}</span>
                  <span className="text-[11px] text-muted-foreground">/{row.slug}</span>
                </div>
              </TableCell>
              <TableCell className="text-xs">
                <div className="flex flex-col gap-0.5">
                  <Badge variant="outline" className="w-fit">
                    {row.category_slug} / {row.sub_category_slug}
                  </Badge>
                  {row.label ? <span className="text-[10px] text-primary">{row.label}</span> : null}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.author_name ?? `#${row.author_id}`}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={Boolean(row.visible)}
                    disabled={busy === row.id}
                    onCheckedChange={(next) => toggle(row.id, next)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {row.visible ? "Visible" : "Hidden"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {row.updated_date}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" asChild disabled={busy === row.id}>
                    <Link href={`/adminzone/tutorials/edit?id=${row.id}`}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Delete"
                    disabled={busy === row.id}
                    onClick={() => remove(row.id)}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
