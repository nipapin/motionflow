"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import type { HelpArticleRow } from "@/lib/admin/help-center";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteHelpArticle, toggleHelpArticleVisibility } from "@/app/(adminzone)/_actions/help-center";

export function HelpCenterTable({ rows }: { rows: HelpArticleRow[] }) {
  const [busy, setBusy] = React.useState<number | null>(null);

  async function toggle(id: number, next: boolean) {
    setBusy(id);
    try {
      const r = await toggleHelpArticleVisibility(id, next);
      if (r.ok) toast.success(next ? "Article published" : "Article hidden");
      else toast.error(r.error ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this article? This cannot be undone.")) return;
    setBusy(id);
    try {
      const r = await deleteHelpArticle(id);
      if (r.ok) toast.success("Article deleted");
      else toast.error(r.error ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
        No articles yet. Use “New article” above to add the first one.
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
            <TableHead className="w-[120px]">Visibility</TableHead>
            <TableHead className="w-[120px]">Updated</TableHead>
            <TableHead className="w-[200px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-xs">{row.id}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{row.title}</span>
                  <span className="text-xs text-muted-foreground">/{row.slug}</span>
                </div>
              </TableCell>
              <TableCell className="text-sm">
                {row.category_title ? (
                  <div className="flex flex-col gap-0.5">
                    <span>{row.category_title}</span>
                    <span className="text-[11px] text-muted-foreground">{row.section_slug}</span>
                  </div>
                ) : (
                  <Badge variant="outline">No category</Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={Boolean(row.visible)}
                    disabled={busy === row.id}
                    onCheckedChange={(next) => toggle(row.id, next)}
                    aria-label={row.visible ? "Hide article" : "Publish article"}
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
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    disabled={busy === row.id}
                  >
                    <Link href={`/adminzone/help_center/edit?id=${row.id}`}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={row.visible ? "Hide" : "Show"}
                    disabled={busy === row.id}
                    onClick={() => toggle(row.id, !row.visible)}
                  >
                    {row.visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
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
