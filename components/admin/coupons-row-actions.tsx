"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteCouponAction,
  toggleCouponStatus,
} from "@/app/(adminzone)/_actions/coupons";

export function CouponRowActions({ id, status }: { id: number; status: number }) {
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
    if (!confirm("Soft-delete this coupon?")) return;
    await run(() => deleteCouponAction(id), "Deleted");
  }

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" asChild disabled={pending}>
        <Link href={`/adminzone/coupons/edit?id=${id}`}>
          <Pencil className="size-3.5" />
          Edit
        </Link>
      </Button>
      {status === 1 ? (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Disable"
          disabled={pending}
          onClick={() => run(() => toggleCouponStatus(id, -1), "Disabled")}
        >
          <PowerOff className="size-3.5" />
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Enable"
          disabled={pending}
          onClick={() => run(() => toggleCouponStatus(id, 1), "Enabled")}
        >
          <Power className="size-3.5" />
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
