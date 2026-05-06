"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  restoreShortLinkAction,
  softDeleteShortLinkAction,
} from "@/app/(adminzone)/_actions/affiliate";

export function AffiliateRowActions({ id, deleted }: { id: number; deleted: boolean }) {
  const [pending, setPending] = React.useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setPending(true);
    try {
      const r = await action();
      if (r.ok) toast.success(ok);
      else toast.error(r.error ?? "Failed");
    } finally {
      setPending(false);
    }
  }

  if (deleted) {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => restoreShortLinkAction(id), "Restored")}
      >
        Restore
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => run(() => softDeleteShortLinkAction(id), "Deleted")}
    >
      Soft delete
    </Button>
  );
}
