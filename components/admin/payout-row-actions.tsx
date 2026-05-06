"use client";

import * as React from "react";
import { toast } from "sonner";
import { Ban, Check, PauseCircle, Slash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  approvePayoutAction,
  cancelPayoutAction,
  reservePayoutAction,
  unavailablePayoutAction,
} from "@/app/(adminzone)/_actions/admin-payouts";

export function PayoutRowActions({ id, status }: { id: number; status: number }) {
  const [pending, setPending] = React.useState(false);

  async function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, msg: string) {
    setPending(true);
    try {
      const r = await fn();
      if (r.ok) toast.success(msg);
      else toast.error(r.error ?? "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex justify-end gap-1">
      {status !== 1 ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => approvePayoutAction(id), "Approved")}
        >
          <Check className="size-3.5 text-emerald-500" />
          Approve
        </Button>
      ) : null}
      {status !== -1 ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Cancel"
          disabled={pending}
          onClick={() => run(() => cancelPayoutAction(id), "Cancelled")}
        >
          <Slash className="size-3.5 text-destructive" />
        </Button>
      ) : null}
      {status !== -2 ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Reserve to balance"
          disabled={pending}
          onClick={() => run(() => reservePayoutAction(id), "Reserved")}
        >
          <PauseCircle className="size-3.5" />
        </Button>
      ) : null}
      {status !== -3 ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Mark unavailable"
          disabled={pending}
          onClick={() => run(() => unavailablePayoutAction(id), "Marked unavailable")}
        >
          <Ban className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
