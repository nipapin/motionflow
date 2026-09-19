"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { toast } from "sonner";
import { Loader2, Search, X } from "lucide-react";
import type {
  AdminMarketItemHit,
  AdminUserPurchaseRow,
  AdminUserSubscriptionRow,
} from "@/lib/admin-users-shared";
import {
  entitlementSourceLabel,
  formatAdminDate,
  subscriptionStatusLabel,
} from "@/lib/admin-users-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SubKind =
  | "motionflow_creator"
  | "motionflow_creator_ai"
  | "spunkram_library"
  | "spunkram_ai"
  | "premiere_gal";

type Duration = "until_revoked" | "1_month" | "1_year";
type GalPlan = "monthly" | "yearly" | "lifetime";

type PendingSub = {
  subKind: SubKind;
  duration: Duration;
  galPlan: GalPlan;
};

const SUB_KIND_LABELS: Record<SubKind, string> = {
  motionflow_creator: "Creator",
  motionflow_creator_ai: "Creator + AI",
  spunkram_library: "Spunkram Editor",
  spunkram_ai: "Spunkram Editor AI",
  premiere_gal: "Premiere Gal",
};

const DURATION_LABELS: Record<Duration, string> = {
  until_revoked: "Until revoked",
  "1_month": "1 month",
  "1_year": "1 year",
};

function pendingSubLabel(pending: PendingSub): string {
  const name = SUB_KIND_LABELS[pending.subKind];
  if (pending.subKind === "premiere_gal") return `${name} · ${pending.galPlan}`;
  return `${name} · ${DURATION_LABELS[pending.duration]}`;
}

export type AdminUserEntitlementsHandle = {
  applyPending: () => Promise<boolean>;
};

export const AdminUserEntitlements = forwardRef<
  AdminUserEntitlementsHandle,
  {
    userId: number;
    purchases: AdminUserPurchaseRow[];
    subscriptions: AdminUserSubscriptionRow[];
    disabled?: boolean;
    onPendingChange?: (pending: boolean) => void;
    onChanged?: () => void;
  }
>(function AdminUserEntitlements(
  { userId, purchases, subscriptions, disabled, onPendingChange, onChanged },
  ref,
) {
  const [subKind, setSubKind] = useState<SubKind>("motionflow_creator");
  const [duration, setDuration] = useState<Duration>("until_revoked");
  const [galPlan, setGalPlan] = useState<GalPlan>("lifetime");
  const [pendingSub, setPendingSub] = useState<PendingSub | null>(null);

  const [itemDraft, setItemDraft] = useState("");
  const [itemQ, setItemQ] = useState("");
  const [itemHits, setItemHits] = useState<AdminMarketItemHit[]>([]);
  const [itemBusy, setItemBusy] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AdminMarketItemHit | null>(null);

  const [pendingRevoke, setPendingRevoke] = useState<
    | { type: "sub"; id: number; system: string; label: string }
    | { type: "purchase"; id: number; system: string; label: string }
    | null
  >(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setItemQ(itemDraft.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [itemDraft]);

  useEffect(() => {
    if (itemQ.length < 1) {
      setItemHits([]);
      return;
    }
    const ac = new AbortController();
    setItemBusy(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/users/items?q=${encodeURIComponent(itemQ)}`,
          { signal: ac.signal },
        );
        const data = (await res.json().catch(() => ({}))) as {
          items?: AdminMarketItemHit[];
        };
        if (!res.ok) return;
        setItemHits(data.items ?? []);
      } catch (err) {
        if (!ac.signal.aborted) console.error("[admin-user-items]", err);
      } finally {
        if (!ac.signal.aborted) setItemBusy(false);
      }
    })();
    return () => ac.abort();
  }, [itemQ]);

  const refresh = () => onChanged?.();

  useEffect(() => {
    onPendingChange?.(pendingSub != null || selectedItem != null);
  }, [pendingSub, selectedItem, onPendingChange]);

  const postSubscription = async (pending: PendingSub): Promise<boolean> => {
    let body: Record<string, unknown>;
    if (pending.subKind === "motionflow_creator" || pending.subKind === "motionflow_creator_ai") {
      body = {
        kind: "motionflow",
        tier: pending.subKind === "motionflow_creator_ai" ? "creator_ai" : "creator",
        duration: pending.duration,
      };
    } else if (pending.subKind === "spunkram_library" || pending.subKind === "spunkram_ai") {
      body = {
        kind: "spunkram",
        tier: pending.subKind === "spunkram_ai" ? "ai_toolkit" : "library",
        duration: pending.duration,
      };
    } else {
      body = { kind: "premiere_gal", plan: pending.galPlan };
    }
    const res = await fetch(`/api/admin/users/${userId}/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not grant subscription");
      return false;
    }
    return true;
  };

  const postPurchase = async (item: AdminMarketItemHit): Promise<boolean> => {
    const res = await fetch(`/api/admin/users/${userId}/purchases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!res.ok) {
      setError(
        data.error === "ITEM_NOT_FOUND"
          ? "Item not found"
          : (data.error ?? "Could not grant purchase"),
      );
      return false;
    }
    return true;
  };

  const applyPending = useCallback(async () => {
    const sub = pendingSub;
    const item = selectedItem;
    if (!sub && !item) return true;
    setError(null);
    try {
      if (sub) {
        const ok = await postSubscription(sub);
        if (!ok) return false;
        setPendingSub(null);
      }
      if (item) {
        const ok = await postPurchase(item);
        if (!ok) return false;
        setSelectedItem(null);
        setItemDraft("");
      }
      refresh();
      return true;
    } catch (err) {
      console.error("[admin-user-entitlement-save]", err);
      setError("Network error. Try again.");
      return false;
    }
  }, [pendingSub, selectedItem, userId, onChanged]);

  useImperativeHandle(ref, () => ({ applyPending }), [applyPending]);

  const runRevokeOrRestore = async (
    kind: "sub" | "purchase",
    id: number,
    restore: boolean,
  ) => {
    setActing(true);
    setError(null);
    try {
      const path =
        kind === "sub"
          ? `/api/admin/users/${userId}/subscriptions/${id}/revoke`
          : `/api/admin/users/${userId}/purchases/${id}/revoke`;
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(restore ? { restore: true } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not update entitlement");
        return;
      }
      toast.success(restore ? "Access restored" : "Access revoked");
      setPendingRevoke(null);
      refresh();
    } catch (err) {
      console.error("[admin-user-entitlement]", err);
      setError("Network error. Try again.");
    } finally {
      setActing(false);
    }
  };

  const confirmRevoke = () => {
    if (!pendingRevoke) return;
    void runRevokeOrRestore(pendingRevoke.type, pendingRevoke.id, false);
  };

  const paddleWarning =
    pendingRevoke && entitlementSourceLabel(pendingRevoke.system) === "paddle";

  return (
    <div className="space-y-8">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Grant subscription</h3>
          <p className="text-xs text-muted-foreground">
            Complimentary access with no Paddle charge. Queued until you save.
            Existing Motionflow catalog rows are deactivated so only one catalog
            plan stays active.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["motionflow_creator", "Creator"],
              ["motionflow_creator_ai", "Creator + AI"],
              ["spunkram_library", "Spunkram Editor"],
              ["spunkram_ai", "Spunkram Editor AI"],
              ["premiere_gal", "Premiere Gal"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSubKind(value)}
              disabled={disabled}
              className={
                subKind === value
                  ? "rounded-lg border border-blue-500/60 bg-blue-500/10 px-3 py-2 text-sm text-foreground"
                  : "rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:border-blue-500/30 hover:text-foreground"
              }
            >
              {label}
            </button>
          ))}
        </div>
        {subKind === "premiere_gal" ? (
          <div className="flex flex-wrap gap-2">
            {(["lifetime", "yearly", "monthly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setGalPlan(value)}
                disabled={disabled}
                className={
                  galPlan === value
                    ? "rounded-lg border border-blue-500/60 bg-blue-500/10 px-3 py-2 text-sm text-foreground"
                    : "rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:border-blue-500/30"
                }
              >
                {value}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["until_revoked", "Until revoked"],
                ["1_month", "1 month"],
                ["1_year", "1 year"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDuration(value)}
                disabled={disabled}
                className={
                  duration === value
                    ? "rounded-lg border border-blue-500/60 bg-blue-500/10 px-3 py-2 text-sm text-foreground"
                    : "rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:border-blue-500/30"
                }
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {pendingSub ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
            <p>
              Will grant{" "}
              <span className="font-medium">{pendingSubLabel(pendingSub)}</span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => setPendingSub(null)}
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => setPendingSub({ subKind, duration, galPlan })}
          >
            Queue subscription
          </Button>
        )}
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subscription</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ends</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscriptions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-sm text-muted-foreground">
                No subscriptions.
              </TableCell>
            </TableRow>
          ) : (
            subscriptions.map((row) => {
              const source = entitlementSourceLabel(row.system);
              const active = row.status === 1 || row.status === -1;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">{row.subscriptionId}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.plan ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={source === "admin" ? "secondary" : "outline"}>
                      {source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.status === 1 ? "default" : "secondary"}>
                      {subscriptionStatusLabel(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatAdminDate(row.endsAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {active ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                        disabled={disabled}
                        onClick={() =>
                          setPendingRevoke({
                            type: "sub",
                            id: row.id,
                            system: row.system,
                            label: row.label,
                          })
                        }
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() => void runRevokeOrRestore("sub", row.id, true)}
                      >
                        Restore
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Grant purchase</h3>
          <p className="text-xs text-muted-foreground">
            Search marketplace items by id or name. Queued until you save.
          </p>
        </div>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={itemDraft}
            onChange={(e) => {
              setItemDraft(e.target.value);
              setSelectedItem(null);
            }}
            disabled={disabled}
            placeholder="Item id or name"
            className="pl-9"
          />
        </div>
        {itemBusy ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Searching items…
          </p>
        ) : null}
        {itemHits.length > 0 && !selectedItem ? (
          <ul className="max-h-56 overflow-auto rounded-lg border border-border/60">
            {itemHits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  disabled={disabled}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:opacity-50"
                  onClick={() => {
                    setSelectedItem(hit);
                    setItemDraft(`${hit.id} · ${hit.name}`);
                  }}
                >
                  <span>
                    <span className="font-medium">{hit.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">#{hit.id}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{hit.slug}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {selectedItem ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
            <p>
              Will grant{" "}
              <span className="font-medium">{selectedItem.name}</span>{" "}
              <span className="text-muted-foreground">#{selectedItem.id}</span>
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setSelectedItem(null);
                setItemDraft("");
              }}
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </Button>
          </div>
        ) : null}
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-sm text-muted-foreground">
                No purchases.
              </TableCell>
            </TableRow>
          ) : (
            purchases.map((row) => {
              const source = entitlementSourceLabel(row.system);
              const active = row.status === 1;
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.itemName ?? `Item #${row.itemId}`}</p>
                    <p className="text-xs text-muted-foreground">#{row.itemId}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.purchaseCode ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={source === "admin" ? "secondary" : "outline"}>
                      {source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={active ? "default" : "secondary"}>
                      {active ? "Owned" : "Revoked"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatAdminDate(row.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {active ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                        disabled={disabled}
                        onClick={() =>
                          setPendingRevoke({
                            type: "purchase",
                            id: row.id,
                            system: row.system,
                            label: row.itemName ?? `Item #${row.itemId}`,
                          })
                        }
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() => void runRevokeOrRestore("purchase", row.id, true)}
                      >
                        Restore
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <AlertDialog
        open={pendingRevoke != null}
        onOpenChange={(open) => {
          if (!acting && !open) setPendingRevoke(null);
        }}
      >
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevoke
                ? `This immediately removes site access for ${pendingRevoke.label}.`
                : null}{" "}
              {paddleWarning
                ? "This row was paid in Paddle. Billing there will continue unless you cancel it in Paddle separately."
                : "The user will lose download / subscription access on the site."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={acting}
              onClick={confirmRevoke}
            >
              {acting ? "Revoking…" : "Revoke"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
