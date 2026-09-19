"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Loader2, User } from "lucide-react";
import type {
  AdminUserDetail,
  AdminUserPurchaseRow,
  AdminUserSubscriptionRow,
} from "@/lib/admin-users-shared";
import { accessRoleLabel } from "@/lib/admin-users-shared";
import {
  AdminUserEntitlements,
  type AdminUserEntitlementsHandle,
} from "@/components/admin-user-entitlements";
import {
  AdminUserSettingsForm,
  type AdminUserSettingsHandle,
} from "@/components/admin-user-settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type DrawerTab = "profile" | "access";

const drawerTabTriggerClass =
  "h-8 flex-none cursor-pointer justify-start gap-2 rounded-lg px-2.5 text-sm font-medium shadow-none " +
  "text-muted-foreground hover:bg-foreground/5 hover:text-foreground " +
  "data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r " +
  "data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white " +
  "data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/20 " +
  "dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-linear-to-r " +
  "dark:data-[state=active]:from-blue-600 dark:data-[state=active]:to-blue-500 dark:data-[state=active]:text-white " +
  "[&_svg]:text-blue-400 data-[state=active]:[&_svg]:text-white";

function TabDot({ show, onActive }: { show: boolean; onActive: boolean }) {
  if (!show) return null;
  return (
    <span
      className={cn(
        "ml-auto size-1.5 shrink-0 rounded-full",
        onActive ? "bg-white" : "bg-blue-500",
      )}
      aria-hidden
    />
  );
}

type Payload = {
  user: AdminUserDetail;
  purchases: AdminUserPurchaseRow[];
  subscriptions: AdminUserSubscriptionRow[];
};

export function AdminUserDrawer({
  userId,
  onOpenChange,
  onUserUpdated,
}: {
  userId: number | null;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: (user: AdminUserDetail) => void;
}) {
  const open = userId != null;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DrawerTab>("profile");
  const [profileDirty, setProfileDirty] = useState(false);
  const [entitlementsPending, setEntitlementsPending] = useState(false);
  const settingsRef = useRef<AdminUserSettingsHandle>(null);
  const entitlementsRef = useRef<AdminUserEntitlementsHandle>(null);

  const load = useCallback(async (id: number, signal?: AbortSignal) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { signal });
      const data = (await res.json().catch(() => ({}))) as Payload & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not load user");
        setPayload(null);
        return;
      }
      setPayload({
        user: data.user,
        purchases: data.purchases ?? [],
        subscriptions: data.subscriptions ?? [],
      });
    } catch (err) {
      if (signal?.aborted) return;
      console.error("[admin-user-drawer]", err);
      setError("Network error. Try again.");
      setPayload(null);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (userId == null) {
      setPayload(null);
      setError(null);
      setProfileDirty(false);
      setEntitlementsPending(false);
      setTab("profile");
      return;
    }
    setTab("profile");
    const ac = new AbortController();
    void load(userId, ac.signal);
    return () => ac.abort();
  }, [userId, load]);

  const user = payload?.user ?? null;
  const canSave = profileDirty || entitlementsPending;

  const handleSave = async () => {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      const profileOk = await settingsRef.current?.save();
      if (profileOk === false) return;
      const entitlementsOk = await entitlementsRef.current?.applyPending();
      if (entitlementsOk === false) return;
      toast.success("Changes saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-full overflow-hidden">
        <DrawerHeader className="border-b border-border/60">
          <DrawerTitle className="flex flex-wrap items-center gap-2">
            {user?.name ?? (busy ? "Loading…" : "User")}
            {user ? (
              <Badge variant={user.access === 100 ? "default" : "secondary"}>
                {accessRoleLabel(user.access)}
              </Badge>
            ) : null}
          </DrawerTitle>
          <DrawerDescription>{user?.email ?? "Edit account and entitlements"}</DrawerDescription>
        </DrawerHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (value === "profile" || value === "access") setTab(value);
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {user && payload ? (
            <div className="shrink-0 px-4 pt-3">
              <TabsList className="h-auto w-fit gap-1 rounded-none border-0 bg-transparent p-0">
                <TabsTrigger value="profile" className={drawerTabTriggerClass}>
                  <User className="h-4 w-4" />
                  Profile
                  <TabDot show={profileDirty} onActive={tab === "profile"} />
                </TabsTrigger>
                <TabsTrigger value="access" className={drawerTabTriggerClass}>
                  <CreditCard className="h-4 w-4" />
                  Subscriptions & purchases
                  <TabDot show={entitlementsPending} onActive={tab === "access"} />
                </TabsTrigger>
              </TabsList>
            </div>
          ) : null}

          {busy && !payload ? (
            <div className="flex flex-1 items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading user…
            </div>
          ) : error ? (
            <div
              role="alert"
              className="m-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : user && payload ? (
            <>
              <TabsContent
                value="profile"
                forceMount
                className="min-h-0 flex-1 overflow-y-auto p-4 data-[state=inactive]:hidden"
              >
                <AdminUserSettingsForm
                  key={user.id}
                  ref={settingsRef}
                  user={user}
                  disabled={saving}
                  onDirtyChange={setProfileDirty}
                  onSaved={(next) => {
                    setPayload((prev) => (prev ? { ...prev, user: next } : prev));
                    onUserUpdated(next);
                  }}
                />
              </TabsContent>
              <TabsContent
                value="access"
                forceMount
                className="min-h-0 flex-1 overflow-y-auto p-4 data-[state=inactive]:hidden"
              >
                <AdminUserEntitlements
                  key={user.id}
                  ref={entitlementsRef}
                  userId={user.id}
                  purchases={payload.purchases}
                  subscriptions={payload.subscriptions}
                  disabled={saving}
                  onPendingChange={setEntitlementsPending}
                  onChanged={() => {
                    if (userId != null) void load(userId);
                  }}
                />
              </TabsContent>
            </>
          ) : null}
        </Tabs>

        {user && payload ? (
          <DrawerFooter className="border-t border-border/60 sm:flex-row sm:justify-end">
            <Button
              type="button"
              disabled={saving || !canSave}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
