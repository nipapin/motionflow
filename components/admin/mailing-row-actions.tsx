"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteMailingAction,
  markMailingSent,
} from "@/app/(adminzone)/_actions/mailing";

export function MailingRowActions({
  id,
  isSent,
}: {
  id: number;
  isSent: boolean;
}) {
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
    if (!confirm("Delete this mailing? Permanent.")) return;
    await run(() => deleteMailingAction(id), "Deleted");
  }

  async function send() {
    if (!confirm("Mark this mailing as sent? This is a status flip — actual email dispatch is not wired in Next.js yet.")) return;
    await run(() => markMailingSent(id), "Marked as sent");
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" asChild disabled={pending}>
        <Link href={`/adminzone/mailing_marketing/edit?id=${id}`}>
          <Pencil className="size-3.5" />
          Edit
        </Link>
      </Button>
      {!isSent ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Mark sent"
          disabled={pending}
          onClick={send}
        >
          <Send className="size-3.5 text-primary" />
        </Button>
      ) : null}
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
