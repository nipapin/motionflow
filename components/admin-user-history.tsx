"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { accessRoleLabel } from "@/lib/admin-users-shared";
import type { AccountAuditEntry, AccountAuditPage, AccountChange } from "@/lib/account-audit-shared";

const fieldLabels: Record<string, string> = {
  id: "Account ID", name: "Login name", email: "Email", first_name: "First name",
  last_name: "Last name", access: "Role", mailing: "Mailing opt-in",
  password: "Password", email_verified_at: "Email verified", google_linked: "Google account linked",
  extra_generations_count: "Extra AI generations", balance: "Author balance",
  city: "City", address_line: "Address", postal_code: "Postal code", country: "Country",
  company_name: "Company", extra_tax: "Extra tax", awards: "Awards", can_hire: "Available for hire",
  settings_json: "Settings", profile_description: "Profile description", profile_socials_json: "Social links",
  withdraw_method: "Payout method", withdraw_account: "Payout account", withdraw_min_amount: "Minimum payout",
  created_at: "Registration date", subscription_id: "Subscription ID", last_payment_id: "Last payment ID",
  last_payment_method: "Last payment method", last_payment_four: "Payment card ending",
  referred_by_affiliate_id: "Referring partner", referred_by_campaign: "Referral campaign",
};

const sourceLabels: Record<string, string> = {
  "admin.users": "Admin", "admin.credits": "Admin · AI credits", profile: "Account settings",
  password_reset: "Password reset", email_verification: "Email verification",
  google_oauth: "Google sign-in", registration: "Registration", database: "Database / system",
};

function changeValue(field: string, value: string | number | boolean | null): string {
  if (field === "mailing") return value === 0 ? "Yes" : "No";
  if (value == null) return "—";
  if (field === "access") return accessRoleLabel(Number(value));
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value) || "(empty)";
}

function ChangeRow({ field, change }: { field: string; change: AccountChange }) {
  return (
    <div className="space-y-1 py-2 text-sm">
      <dt className="font-medium">{fieldLabels[field] ?? field}</dt>
      <dd className="whitespace-pre-wrap break-words text-muted-foreground">
        {"changed" in change ? "Changed" : (
          <>
            <span>{changeValue(field, change.before)}</span>
            <span className="mx-2" aria-label="changed to">→</span>
            <span className="text-foreground">{changeValue(field, change.after)}</span>
          </>
        )}
      </dd>
    </div>
  );
}

export function AdminUserHistory({ userId, revision }: { userId: number; revision: number }) {
  const [entries, setEntries] = useState<AccountAuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async (nextCursor?: string) => {
    requestRef.current?.abort();
    const ac = new AbortController();
    requestRef.current = ac;
    setBusy(true);
    setError(null);
    try {
      const query = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : "";
      const res = await fetch(`/api/admin/users/${userId}/history${query}`, {
        signal: ac.signal, cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load account history. Try again.");
      const page = await res.json() as AccountAuditPage;
      if (ac.signal.aborted) return;
      setEntries((prev) => nextCursor ? [...prev, ...page.entries] : page.entries);
      setCursor(page.nextCursor);
    } catch (err) {
      if (!ac.signal.aborted) setError(err instanceof Error ? err.message : "Could not load account history.");
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  }, [userId]);

  useEffect(() => {
    setEntries([]);
    setCursor(null);
    void load();
    return () => requestRef.current?.abort();
  }, [load, revision]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Account changes, newest first</p>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {busy && entries.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading history…</p>
      ) : !error && entries.length === 0 ? (
        <p className="rounded-lg border border-border/60 p-4 text-sm text-muted-foreground">
          No changes recorded yet. History starts when account logging is enabled.
        </p>
      ) : null}
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-lg border border-border/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant="secondary">
              {entry.action === "created" ? "Account created" : entry.action === "deleted" ? "Account deleted" : "Account updated"}
            </Badge>
            <time dateTime={entry.createdAt} className="text-xs text-muted-foreground">
              {new Date(entry.createdAt).toLocaleString("en-GB")}
            </time>
          </div>
          <p className="mt-2 break-words text-xs text-muted-foreground">
            {sourceLabels[entry.source] ?? entry.source}
            {entry.actorUserId != null ? ` · ${entry.actorName ?? "User"} (#${entry.actorUserId})` : " · Actor unknown"}
          </p>
          <dl className="mt-2 divide-y divide-border/40">
            {Object.entries(entry.changes)
              .filter(([, change]) => entry.action === "updated" || "changed" in change || change.before != null || change.after != null)
              .map(([field, change]) => <ChangeRow key={field} field={field} change={change} />)}
          </dl>
        </article>
      ))}
      {cursor ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void load(cursor)}>
          {busy ? "Loading…" : "Load older changes"}
        </Button>
      ) : null}
    </div>
  );
}
