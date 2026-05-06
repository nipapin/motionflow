"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AdminRequestDetail } from "@/lib/admin/requests";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignRequestToMeAction,
  closeRequestAction,
  reopenRequestAction,
} from "@/app/(adminzone)/_actions/requests";

const CLOSE_PRESETS = [
  { value: "@resolved", label: "Resolved" },
  { value: "@duplicate", label: "Duplicate" },
  { value: "@fixed", label: "Fixed" },
  { value: "@deprecated", label: "Deprecated" },
] as const;

export function RequestDetailPanel({
  detail,
  currentStaffId,
}: {
  detail: AdminRequestDetail;
  currentStaffId: number;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [resolution, setResolution] = React.useState<string>(CLOSE_PRESETS[0].value);

  let parsed: Record<string, unknown> | null = null;
  if (detail.content_json) {
    try {
      parsed = JSON.parse(detail.content_json) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }

  const isOpen = !detail.answered;

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success("Saved");
        router.refresh();
      } else toast.error(r.error ?? "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Request #{detail.id}</p>
          <h2 className="text-xl font-semibold tracking-tight">{detail.type_label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Submitted {detail.created_label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOpen ? (
            <>
              {detail.assigned_staff_id !== currentStaffId ? (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => assignRequestToMeAction(detail.id))}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Assign to me
                </Button>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Close as</Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="h-9 w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLOSE_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" disabled={pending} onClick={() => run(() => closeRequestAction(detail.id, resolution))}>
                  Close request
                </Button>
              </div>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reopenRequestAction(detail.id))}>
              Re-open
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link href="/adminzone/requests">Back to list</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {detail.answered ? (
          <AdminStatusBadge label={`Closed (${detail.answered})`} tone="closed" />
        ) : (
          <AdminStatusBadge label={detail.expect_resolve ? "Expect resolve" : "Awaiting"} tone={detail.expect_resolve ? "expect_resolve" : "awaiting"} />
        )}
        {detail.user_name ? (
          <span className="text-sm text-muted-foreground">
            User: <span className="text-foreground">{detail.user_name}</span>
          </span>
        ) : null}
      </div>

      {parsed ? (
        <section className="card rounded-xl border border-border/60 p-4">
          <h3 className="text-sm font-semibold">Payload</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(parsed).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 wrap-break-word text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : detail.content_json ? (
        <pre className="card max-h-[320px] overflow-auto rounded-xl border border-border/60 p-4 text-xs">{detail.content_json}</pre>
      ) : null}

      {detail.pc_info ? (
        <section className="card rounded-xl border border-border/60 p-4">
          <h3 className="text-sm font-semibold">Client / PC info</h3>
          <pre className="mt-2 max-h-[200px] overflow-auto text-xs text-muted-foreground">{detail.pc_info}</pre>
        </section>
      ) : null}
    </div>
  );
}
