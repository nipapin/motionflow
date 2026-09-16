"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { Affiliate, AffiliateRecurringMode } from "@/lib/affiliate/types";

/**
 * Editable partner settings. The slug and email stay read-only: the slug is
 * already printed in the partner's bio, and the email is what links their
 * account and their commissions.
 */
export function PartnerSettingsForm({ affiliate }: { affiliate: Affiliate }) {
  const router = useRouter();
  const [name, setName] = useState(affiliate.name);
  const [socialUrl, setSocialUrl] = useState(affiliate.socialUrl ?? "");
  const [commissionPercent, setCommissionPercent] = useState(
    String(affiliate.commissionPercent),
  );
  const [recurringMode, setRecurringMode] = useState<AffiliateRecurringMode>(
    affiliate.recurringMode,
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || deleting;

  const patch = async (body: Record<string, unknown>, successMessage: string) => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/partners/${affiliate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Could not save");
        return;
      }
      toast.success(successMessage);
      router.refresh();
    } catch (err) {
      console.error("[partner-settings]", err);
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const removePartner = async () => {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/partners/${affiliate.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Could not delete partner");
        setDeleteOpen(false);
        return;
      }
      toast.success("Partner deleted");
      setDeleteOpen(false);
      router.push("/profile/partners");
      router.refresh();
    } catch (err) {
      console.error("[partner-settings delete]", err);
      setError("Network error. Try again.");
    } finally {
      setDeleting(false);
    }
  };

  const isActive = affiliate.status === "active";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-partner-name">Name</Label>
          <Input
            id="edit-partner-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-partner-social">Social link</Label>
          <Input
            id="edit-partner-social"
            type="url"
            value={socialUrl}
            onChange={(e) => setSocialUrl(e.target.value)}
            placeholder="https://youtube.com/@channel"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-partner-percent">Income %</Label>
          <Input
            id="edit-partner-percent"
            type="number"
            min={1}
            max={100}
            step="0.01"
            value={commissionPercent}
            onChange={(e) => setCommissionPercent(e.target.value)}
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            Applies to future payments; already accrued income keeps its percent.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Income applies to</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "all", label: "Every payment" },
                { value: "first_only", label: "First payment only" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRecurringMode(option.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm smooth",
                  recurringMode === option.value
                    ? "border-blue-500/60 bg-blue-500/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:border-blue-500/30 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            void patch(
              {
                name,
                socialUrl,
                commissionPercent: Number(commissionPercent),
                recurringMode,
              },
              "Partner updated",
            )
          }
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-3 border-l border-border/60 pl-3">
          <p className="max-w-sm text-xs text-muted-foreground">
            {isActive
              ? "Deactivating stops the link from setting cookies and stops all new income, including renewals. Earned money stays payable."
              : "Reactivating resumes attribution and income."}
          </p>
          <Button
            type="button"
            variant={isActive ? "destructive" : "outline"}
            disabled={busy}
            onClick={() =>
              void patch(
                { status: isActive ? "inactive" : "active" },
                isActive ? "Partner deactivated" : "Partner reactivated",
              )
            }
          >
            {isActive ? "Deactivate" : "Reactivate"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete partner?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {affiliate.name} ({affiliate.email}). Their
              referral link will stop working, the slug can be reused, and income,
              payout, click, and campaign history will be deleted. Unpaid income
              is not kept. Their Motion Flow login stays. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void removePartner()}
            >
              {deleting ? "Deleting…" : "Delete partner"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
