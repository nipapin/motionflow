"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ControlActionId } from "@/lib/admin/control";
import { Button } from "@/components/ui/button";
import { runControlActionServerAction } from "@/app/(adminzone)/_actions/control";

export function ControlActionButton({
  id,
  destructive,
  disabled,
  children,
}: {
  id: ControlActionId;
  destructive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [pending, setPending] = React.useState(false);
  async function run() {
    if (destructive && !confirm("Run this destructive action?")) return;
    setPending(true);
    try {
      const r = await runControlActionServerAction(id);
      if (r.ok) toast.success(r.message);
      else toast.error(r.error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Button
      size="sm"
      variant={destructive ? "destructive" : "secondary"}
      disabled={disabled || pending}
      onClick={run}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}
