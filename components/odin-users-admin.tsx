"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type User = { id: string; email: string; name: string; lastname: string };
type Subscription = { id: number; owner_id: string; status: string; order_item_name: string; next_charge_date: string | null; active: boolean; is_lifetime?: boolean; management_source: "manual" | "paypro"; management_disabled: boolean; management_billing_state: string; management_billing_action: string | null };
type Pending = { action: string; label: string; device_id?: string; subscription_id?: number; source?: "manual" | "paypro"; is_lifetime?: boolean; request_id?: string };
const needsDate = (action: string) => ["grant", "subscription_issue", "subscription_update"].includes(action);
const editsSubscription = (action: string) => ["subscription_issue", "subscription_update"].includes(action);
const localDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
};
type Detail = {
  user: User; subscription_active: boolean; extension_access: boolean;
  override: { mode: string; expires_at: string | null } | null;
  subscriptions: Subscription[]; subscription_management?: boolean;
  devices: Array<{ id: string; name: string | null; os: string | null; last_seen_at: string }>;
  audit: Array<{ id: number; actor: string; action: string; reason: string; created_at: string }>;
};
const when = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : value.replaceAll("+", " ");
};
async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error === "ODIN_NOT_CONFIGURED"
    ? "Odin integration is not configured on the server."
    : data?.error === "ODIN_UNAUTHORIZED" ? "Odin rejected the server credentials. Check the integration secret."
    : data?.error === "ODIN_MANAGEMENT_DISABLED" ? "User management is disabled on the Odin server."
    : data?.error === "PAYPRO_NOT_CONFIGURED" ? "PayPro billing management is not configured on the Odin server."
    : data?.error === "PAYPRO_CANNOT_RENEW" ? "PayPro cannot renew a terminated or finished subscription. Issue a new manual subscription or use a new checkout."
    : data?.error === "PAYPRO_UNAVAILABLE" ? "PayPro has not confirmed the billing change. Access is blocked while the billing change is unresolved. Retry this action to check and complete it."
    : data?.error === "SUBSCRIPTION_BUSY" ? "A billing change is in progress. Wait a minute, then refresh or retry."
    : data?.error === "MANUAL_SUBSCRIPTION_REQUIRED" ? "Only manually issued subscriptions can be edited here."
    : data?.error === "INVALID_INPUT" ? "Check the subscription name, future expiry and reason (up to 500 characters)."
    : data?.error === "INVALID_ORIGIN" ? "The request origin could not be verified. Reload the page and try again."
    : data?.error === "FORBIDDEN" ? "Your admin session has expired or you do not have access. Sign in again."
    : data?.error === "NOT_FOUND" ? "This Odin account or device no longer exists. Refresh the account."
    : "Could not complete the request to Odin. Refresh before trying again.");
  return data;
}

export function OdinUsersAdmin() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [list, setList] = useState<{ users: User[]; total: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [listError, setListError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const [plan, setPlan] = useState("Odin Pro");
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => { if (pending) confirmation.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [pending]);

  function begin(action: string, label: string, subscription?: Subscription) {
    setError(""); setReason(""); setPlan(subscription?.order_item_name || "Odin Pro");
    setExpires(localDate(subscription?.next_charge_date || new Date(Date.now() + 30 * 86400000).toISOString()));
    setPending({ action, label, subscription_id: subscription?.id, source: subscription?.management_source, is_lifetime: subscription?.is_lifetime,
      request_id: action === "subscription_issue" ? crypto.randomUUID() : undefined });
  }

  useEffect(() => {
    const controller = new AbortController();
    setList(null); setListError("");
    request(`/api/odin/users?${new URLSearchParams({ q: search, page: String(page) })}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setList(data); })
      .catch(e => { if (!controller.signal.aborted) setListError(e.message); });
    return () => controller.abort();
  }, [search, page, refresh]);

  useEffect(() => {
    setDetail(null); setPending(null); setReason(""); setExpires(""); setError("");
    if (!selected) return;
    const controller = new AbortController();
    request(`/api/odin/users?${new URLSearchParams({ user_id: selected })}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDetail(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [selected, refresh]);

  async function apply() {
    if (!pending || !selected || busy) return;
    if (needsDate(pending.action) && (!expires || !Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now())) {
      setError("Choose an expiry in the future."); return;
    }
    if (editsSubscription(pending.action) && !plan.trim()) { setError("Enter a subscription name."); return; }
    setBusy(true); setError("");
    try {
      await request("/api/odin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        user_id: selected, action: pending.action, device_id: pending.device_id, reason: reason.trim(),
        expires_at: needsDate(pending.action) ? new Date(expires).toISOString() : undefined,
        subscription_id: pending.subscription_id, plan_name: editsSubscription(pending.action) ? plan.trim() : undefined, request_id: pending.request_id,
      }) });
      setPending(null); setRefresh(n => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      if (pending.action.startsWith("subscription_")) {
        // A failed billing request can still have durably blocked access.
        await request(`/api/odin/users?${new URLSearchParams({ user_id: selected })}`).then(setDetail).catch(() => {});
      }
    }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Manage Odin subscriptions, website access and CEP devices.</p>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(q.trim()); setRefresh(n => n + 1); }}>
      <Input aria-label="Search Odin users" placeholder="Email, name or user ID" value={q} onChange={e => setQ(e.target.value)} maxLength={200} />
      <Button type="submit" disabled={busy}>Search</Button>
    </form>
    {listError && <div className="flex items-center gap-3"><p role="alert" className="text-sm text-destructive">{listError}</p><Button variant="outline" disabled={busy} onClick={() => setRefresh(n => n + 1)}>Retry</Button></div>}
    {!list && !listError && <p role="status">Loading Odin users…</p>}
    {list && <>
      <div className="overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Email</th><th className="p-3">Name</th><th className="p-3">Account</th></tr></thead>
        <tbody>{list.users.map(user => <tr key={user.id} className="border-b"><td className="p-3">{user.email}</td><td className="p-3">{user.name} {user.lastname}</td><td className="p-3"><Button variant="outline" disabled={busy} onClick={() => { setError(""); setSelected(user.id); }}>Manage</Button></td></tr>)}</tbody></table></div>
      {list.users.length === 0 && <p>No users found.</p>}
      <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</Button><span>{list.total} users · Page {page}</span><Button variant="outline" disabled={page * 25 >= list.total} onClick={() => setPage(n => n + 1)}>Next</Button></div>
    </>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !busy) { setSelected(null); setError(""); } }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{detail?.user.email || "Odin account"}</DialogTitle><DialogDescription>Subscriptions, extension access and active CEP devices.</DialogDescription></DialogHeader>
      {error && <div className="flex items-center gap-3"><p role="alert" className="text-sm text-destructive">{error}</p>{!detail && <Button variant="outline" disabled={busy} onClick={() => setRefresh(n => n + 1)}>Retry</Button>}</div>}
      {!detail && !error && <p>Loading account…</p>}
      {detail && <div className="space-y-5">
        <div className="space-y-1 text-sm"><p>Website subscription: {detail.subscription_active ? "Active" : "Inactive"}</p><p>Extension access: {detail.extension_access ? "Allowed" : "Blocked"}</p><p>Manual rule: {detail.override ? `${detail.override.mode}${detail.override.expires_at ? ` until ${when(detail.override.expires_at)}` : ""}` : "Follow Odin subscription"}</p></div>
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium">Subscriptions</h3><Button disabled={busy || !detail.subscription_management} onClick={() => begin("subscription_issue", "Issue subscription")}>Issue subscription</Button></div>
          {!detail.subscription_management && <p className="text-sm text-muted-foreground">Update the Odin integration to enable subscription management.</p>}
          {detail.subscriptions.length === 0 && <p className="text-sm text-muted-foreground">No subscription.</p>}
          {detail.subscriptions.map(sub => <div className="space-y-3 rounded-md border bg-muted/20 p-3" key={sub.id}>
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{sub.order_item_name || "Odin Pro"}</p><p className="mt-1 text-xs text-muted-foreground">#{sub.id} · {sub.management_source === "manual" ? "Manually issued" : "PayPro"} · {sub.status}</p></div><span className={`rounded-full px-2 py-1 text-xs ${sub.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{sub.management_disabled ? "Disabled" : sub.active ? "Active" : !sub.is_lifetime && sub.next_charge_date && Date.parse(sub.next_charge_date) <= Date.now() ? "Expired" : "Inactive"}</span></div>
            <p className="text-sm">{sub.is_lifetime ? "Lifetime access · No expiry or recurring billing" : `${sub.management_source === "manual" ? "Valid until" : "Subscription period ends"}: ${when(sub.next_charge_date)}`}</p>
            {["finished", "terminated"].includes(sub.management_billing_state) && <p className="text-xs text-muted-foreground">PayPro subscription is {sub.management_billing_state}. Issue a new manual subscription or use a new checkout to restore access.</p>}
            {["pending", "failed"].includes(sub.management_billing_state) && <p role="status" className="text-sm text-destructive">{sub.management_billing_state === "pending" ? "PayPro change awaiting confirmation. Refresh or retry after a minute." : "PayPro change not confirmed. Retry to reconcile billing."}</p>}
            {sub.owner_id !== detail.user.id ? <p className="text-xs text-muted-foreground">Invited seat · Managed by account {sub.owner_id}</p> : <div className="flex flex-wrap gap-2">
              {sub.management_source === "manual" && <Button variant="outline" size="sm" disabled={busy || !detail.subscription_management} onClick={() => begin("subscription_update", `Edit subscription #${sub.id}`, sub)}>Edit / extend</Button>}
              {(!sub.management_disabled || (["pending", "failed"].includes(sub.management_billing_state) && sub.management_billing_action === "suspend")) && <Button variant="destructive" size="sm" disabled={busy || !detail.subscription_management} onClick={() => begin("subscription_disable", `${["pending", "failed"].includes(sub.management_billing_state) ? "Retry disabling" : "Disable"} subscription #${sub.id}`, sub)}>{["pending", "failed"].includes(sub.management_billing_state) ? "Retry disable" : sub.management_source === "paypro" && !sub.is_lifetime ? "Disable & stop billing" : "Disable"}</Button>}
              {(sub.management_disabled || (sub.management_source === "paypro" && ["on-hold", "failed"].includes(sub.status))) && !(sub.management_billing_action === "suspend" && ["pending", "failed"].includes(sub.management_billing_state)) && <Button variant="outline" size="sm" disabled={busy || !detail.subscription_management || ["finished", "terminated"].includes(sub.management_billing_state) || (sub.is_lifetime && sub.status.toLowerCase() !== "active")} onClick={() => begin("subscription_enable", `Restore subscription #${sub.id}`, sub)}>{sub.management_source === "paypro" && !sub.is_lifetime ? "Restore & resume billing" : "Restore"}</Button>}
            </div>}
          </div>)}
        </section>
        <section className="space-y-3"><h3 className="font-medium">Extension access rule</h3><p className="text-xs text-muted-foreground">These rules override subscriptions only in the extension.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => begin("grant", "Grant extension access")}>Grant access</Button><Button variant="destructive" disabled={busy} onClick={() => begin("revoke", "Block extension access")}>Block access</Button><Button variant="outline" disabled={busy} onClick={() => begin("reset", "Follow Odin subscription")}>Use subscription</Button></div></section>
        {pending && <div ref={confirmation} className="space-y-3 rounded-lg border border-primary/40 p-4"><p className="font-medium">{pending.label} for {detail.user.email}</p>
          <p className="text-sm text-muted-foreground">{pending.action === "subscription_issue" ? "Creates a subscription for the Odin website and extension, without payment or automatic renewal." : pending.action === "subscription_update" ? "Change this manual subscription's name and expiry. Its enabled/disabled state is preserved." : pending.action === "subscription_disable" ? pending.is_lifetime ? "Disable this Lifetime license on the website and extension for its owner and invited seats. There is no recurring billing." : pending.source === "paypro" ? "Block this subscription on Odin and suspend future PayPro charges for its owner and invited seats. Other subscriptions or extension rules may still grant access." : "Disable this manual subscription on the website and extension. Other subscriptions or extension rules may still grant access." : pending.action === "subscription_enable" ? pending.is_lifetime ? "Remove the administrative block from this Lifetime license. Access still requires an active payment status; no payment or renewal is requested." : pending.source === "paypro" ? "Resume the PayPro subscription and future charges. If the renewal date has passed, PayPro may charge the customer. Access follows the confirmed subscription period." : "Restore this manual subscription until its existing expiry. Extend an expired subscription first." : pending.action === "revoke_device" ? "This CEP device will need to sign in again." : pending.action === "revoke" ? "Paid downloads and subscriber features will be blocked after access refresh, even with an active subscription. Existing local files are not deleted." : pending.action === "reset" ? "Remove the manual rule and use the current Odin subscription." : "Access lasts until the selected date. After expiry the Odin subscription applies."}</p>
          {editsSubscription(pending.action) && <label className="block text-sm">Subscription name<Input value={plan} maxLength={200} disabled={busy} onChange={e => setPlan(e.target.value)} /></label>}
          {needsDate(pending.action) && <div className="space-y-2"><label className="block text-sm">{pending.action === "grant" ? "Access" : "Subscription"} until (your local time)<Input type="datetime-local" value={expires} disabled={busy} onChange={e => setExpires(e.target.value)} /></label><div className="flex gap-2">{[30, 90, 365].map(days => <Button key={days} variant="outline" size="sm" disabled={busy} onClick={() => setExpires(localDate(new Date(Math.max(Date.now(), Date.parse(expires) || 0) + days * 86400000).toISOString()))}>+{days} days</Button>)}</div></div>}
          <label className="block text-sm">Reason (optional)<Input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
          <div className="flex gap-2"><Button disabled={busy || (needsDate(pending.action) && !expires) || (editsSubscription(pending.action) && !plan.trim())} onClick={apply}>{busy ? "Saving…" : "Confirm"}</Button><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>Cancel</Button></div></div>}
        <div><h3 className="mb-2 font-medium">Active CEP devices</h3>{detail.devices.length === 0 && <p className="text-sm">No active devices.</p>}{detail.devices.map(device => <div key={device.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span>{device.name || "Device"} · {device.os} · {when(device.last_seen_at)}</span><Button variant="outline" disabled={busy} onClick={() => setPending({ action: "revoke_device", label: `Revoke device ${device.name || device.id}`, device_id: device.id })}>Revoke</Button></div>)}</div>
        <div><h3 className="mb-2 font-medium">Recent management changes</h3>{detail.audit.map(entry => <p key={entry.id} className="mb-2 text-xs text-muted-foreground">{when(entry.created_at)} · {entry.actor} · {entry.action} · {entry.reason}</p>)}</div>
      </div>}
    </DialogContent></Dialog>
  </div>;
}
