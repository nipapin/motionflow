"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deletePageSettingAction } from "@/app/(adminzone)/_actions/page-settings";

export function PageSettingRowActions({ id, canMutate }: { id: number; canMutate: boolean }) {
  const [pending, setPending] = React.useState(false);

  async function remove() {
    if (!confirm("Delete this page setting? Permanent.")) return;
    setPending(true);
    try {
      const r = await deletePageSettingAction(id);
      if (r.ok) toast.success("Deleted");
      else toast.error(r.error ?? "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" asChild disabled={pending}>
        <Link href={`/adminzone/page_settings/edit?id=${id}`}>
          <Pencil className="size-3.5" />
          {canMutate ? "Edit" : "View"}
        </Link>
      </Button>
      {canMutate ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Delete"
          disabled={pending}
          onClick={remove}
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      ) : null}
    </div>
  );
}
