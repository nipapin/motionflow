"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteOfferAction,
  toggleOfferVisibility,
} from "@/app/(adminzone)/_actions/offers";

export function OfferRowActions({ id, visible }: { id: number; visible: boolean }) {
  const [pending, setPending] = React.useState(false);

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, ok: string) {
    setPending(true);
    try {
      const r = await fn();
      if (r.ok) toast.success(ok);
      else toast.error(r.error ?? "Failed");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this offer? This is permanent.")) return;
    await run(() => deleteOfferAction(id), "Deleted");
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" asChild disabled={pending}>
        <Link href={`/adminzone/offers/edit?id=${id}`}>
          <Pencil className="size-3.5" />
          Edit
        </Link>
      </Button>
      {visible ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Hide"
          disabled={pending}
          onClick={() => run(() => toggleOfferVisibility(id, false), "Hidden")}
        >
          <EyeOff className="size-3.5" />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Publish"
          disabled={pending}
          onClick={() => run(() => toggleOfferVisibility(id, true), "Published")}
        >
          <Eye className="size-3.5" />
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-label="Delete"
        disabled={pending}
        onClick={remove}
      >
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </div>
  );
}
