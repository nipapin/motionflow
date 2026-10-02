"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreditCard, History, Loader2, Trash2, User } from "lucide-react";
import { AdminUserHistory } from "@/components/admin-user-history";
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
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type DrawerTab = "profile" | "access" | "history";

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
  canDelete: boolean;
};

export function AdminUserDrawer({
  userId,
  onOpenChange,
  onUserUpdated,
  onUserDeleted,
}: {
  userId: number | null;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: (user: AdminUserDetail) => void;
  onUserDeleted: (id: number) => void;
}) {
  const open = userId != null;
  const [payload, setPayload] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DrawerTab>("profile");
  const [historyRevision, setHistoryRevision] = useState(0);
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
      if (signal?.aborted) return;
      if (!res.ok) {
        setError(data.error ?? "Could not load user");
        setPayload(null);
        return;
      }
      setPayload({
        user: data.user,
        purchases: data.purchases ?? [],
        subscriptions: data.subscriptions ?? [],
        canDelete: data.canDelete === true,
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
    setPayload(null);
    setDeleteOpen(false);
    setDeleteError(null);
    if (userId == null) {
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
    if (saving || deleting || !canSave) return;
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

  const handleDelete = async () => {
    if (!user || !payload?.canDelete || deleting || saving) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setDeleteError(
          data.error === "SELF_DELETE_FORBIDDEN"
            ? "You cannot delete your own account."
            : data.error === "FORBIDDEN"
              ? "You no longer have permission to delete accounts."
              : data.error === "NOT_FOUND"
                ? "This account no longer exists. Close the card and refresh the list."
                : "Could not delete the account. Try again.",
        );
        return;
      }
      setDeleteOpen(false);
      toast.success("Account deleted");
      onUserDeleted(user.id);
    } catch (err) {
      console.error("[admin-user-drawer DELETE]", err);
      setDeleteError("Network error. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Drawer direction="right" open={open} onOpenChange={(next) => {
      if (!deleting && !deleteOpen) onOpenChange(next);
    }}>
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
            if (value === "profile" || value === "access" || value === "history") setTab(value);
          }}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {user && payload ? (
            <div className="shrink-0 px-4 pt-3">
              <TabsList className="h-auto w-fit flex-wrap gap-1 rounded-none border-0 bg-transparent p-0">
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
                <TabsTrigger value="history" className={drawerTabTriggerClass}>
                  <History className="h-4 w-4" />
                  History
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
                  disabled={saving || deleting}
                  onDirtyChange={setProfileDirty}
                  onSaved={(next) => {
                    setPayload((prev) => (prev ? { ...prev, user: next } : prev));
                    setHistoryRevision((prev) => prev + 1);
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
                  disabled={saving || deleting}
                  onPendingChange={setEntitlementsPending}
                  onChanged={() => {
                    setHistoryRevision((prev) => prev + 1);
                    if (userId != null) void load(userId);
                  }}
                />
              </TabsContent>
              <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto p-4">
                <AdminUserHistory key={user.id} userId={user.id} revision={historyRevision} />
              </TabsContent>
            </>
          ) : null}
        </Tabs>

        {user && payload ? (
          <DrawerFooter className="border-t border-border/60 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="destructive"
              className="sm:mr-auto"
              disabled={busy || saving || deleting || !payload.canDelete}
              title={!payload.canDelete ? "You cannot delete your own account" : undefined}
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete account
            </Button>
            <Button
              type="button"
              disabled={saving || deleting || !canSave}
              onClick={() => void handleSave()}
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DrawerFooter>
        ) : null}
      </DrawerContent>
      <AlertDialog open={deleteOpen} onOpenChange={(next) => {
        if (!deleting) setDeleteOpen(next);
      }}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete {user?.email} from the database? The user will lose
              access to their account. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Purchase and payment history will be kept. Any recurring billing must
            be cancelled separately in Paddle.
          </p>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || !user || !payload?.canDelete}
              onClick={() => void handleDelete()}
            >
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Drawer>
  );
}
