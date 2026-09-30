"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type User = { id: string; email: string; name: string; lastname: string };
type Detail = {
  user: User; subscription_active: boolean; extension_access: boolean;
  override: { mode: string; expires_at: string | null } | null;
  subscriptions: Array<{ id: number; owner_id: string; status: string; order_item_name: string; next_charge_date: string | null }>;
  devices: Array<{ id: string; name: string | null; os: string | null; last_seen_at: string }>;
  audit: Array<{ id: number; actor: string; action: string; reason: string; created_at: string }>;
};
const when = (value: string | null) => value ? new Date(value).toLocaleString() : "—";
async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error === "ODIN_NOT_CONFIGURED"
    ? "Odin integration is not configured on the server."
    : data.error === "INVALID_INPUT" ? "Check the access expiry and reason."
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const [pending, setPending] = useState<{ action: string; label: string; device_id?: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setList(null); setError("");
    request(`/api/odin/users?${new URLSearchParams({ q: search, page: String(page) })}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setList(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [search, page, refresh]);

  useEffect(() => {
    setDetail(null); setPending(null); setReason(""); setExpires("");
    if (!selected) return;
    const controller = new AbortController();
    request(`/api/odin/users?${new URLSearchParams({ user_id: selected })}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDetail(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [selected, refresh]);

  async function apply() {
    if (!pending || !selected || !reason.trim()) return;
    if (pending.action === "grant" && (!expires || !Number.isFinite(Date.parse(expires)) || Date.parse(expires) <= Date.now())) {
      setError("Choose an expiry in the future."); return;
    }
    setBusy(true); setError("");
    try {
      await request("/api/odin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        user_id: selected, action: pending.action, device_id: pending.device_id, reason: reason.trim(),
        expires_at: pending.action === "grant" ? new Date(expires).toISOString() : undefined,
      }) });
      setPending(null); setRefresh(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Odin website accounts. Manual access applies to the extension; billing stays on Odin.</p>
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setPage(1); setSearch(q.trim()); setRefresh(n => n + 1); }}>
      <Input aria-label="Search Odin users" placeholder="Email, name or user ID" value={q} onChange={e => setQ(e.target.value)} maxLength={200} />
      <Button type="submit">Search</Button>
    </form>
    {error && !selected && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!list && !error && <p role="status">Loading Odin users…</p>}
    {list && <>
      <div className="overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Email</th><th className="p-3">Name</th><th className="p-3">Account</th></tr></thead>
        <tbody>{list.users.map(user => <tr key={user.id} className="border-b"><td className="p-3">{user.email}</td><td className="p-3">{user.name} {user.lastname}</td><td className="p-3"><Button variant="outline" onClick={() => { setError(""); setSelected(user.id); }}>Manage</Button></td></tr>)}</tbody></table></div>
      {list.users.length === 0 && <p>No users found.</p>}
      <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</Button><span>{list.total} users · Page {page}</span><Button variant="outline" disabled={page * 25 >= list.total} onClick={() => setPage(n => n + 1)}>Next</Button></div>
    </>}
    <Dialog open={selected !== null} onOpenChange={open => { if (!open && !busy) { setSelected(null); setError(""); } }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>{detail?.user.email || "Odin account"}</DialogTitle><DialogDescription>Subscriptions, extension access and active CEP devices.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!detail && !error && <p>Loading account…</p>}
      {detail && <div className="space-y-5">
        <div className="space-y-1 text-sm"><p>Website subscription: {detail.subscription_active ? "Active" : "Inactive"}</p><p>Extension access: {detail.extension_access ? "Allowed" : "Blocked"}</p><p>Manual rule: {detail.override ? `${detail.override.mode}${detail.override.expires_at ? ` until ${when(detail.override.expires_at)}` : ""}` : "Follow Odin subscription"}</p></div>
        <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => setPending({ action: "grant", label: "Grant extension access" })}>Grant access</Button><Button variant="destructive" disabled={busy} onClick={() => setPending({ action: "revoke", label: "Block extension access" })}>Block access</Button><Button variant="outline" disabled={busy} onClick={() => setPending({ action: "reset", label: "Follow Odin subscription" })}>Use subscription</Button></div>
        {pending && <div className="space-y-3 rounded-lg border p-4"><p className="font-medium">{pending.label} for {detail.user.email}</p>
          <p className="text-sm text-muted-foreground">{pending.action === "revoke_device" ? "This CEP device will need to sign in again." : pending.action === "revoke" ? "Paid downloads and subscriber features will be blocked after access refresh, even with an active subscription. Existing local files are not deleted." : pending.action === "reset" ? "Remove the manual rule and use the current Odin subscription." : "Access lasts until the selected date. After expiry the Odin subscription applies."}</p>
          {pending.action === "grant" && <label className="block text-sm">Access until (your local time)<Input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} /></label>}
          <label className="block text-sm">Reason<Input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label>
          <div className="flex gap-2"><Button disabled={busy || !reason.trim() || (pending.action === "grant" && !expires)} onClick={apply}>{busy ? "Saving…" : "Confirm"}</Button><Button variant="outline" disabled={busy} onClick={() => setPending(null)}>Cancel</Button></div></div>}
        <div><h3 className="mb-2 font-medium">Subscriptions</h3>{detail.subscriptions.length === 0 && <p className="text-sm">No subscription.</p>}{detail.subscriptions.map(sub => <p className="text-sm" key={sub.id}>{sub.order_item_name} · {sub.status} · {when(sub.next_charge_date)}{sub.owner_id !== detail.user.id ? " · Invited seat" : ""}</p>)}</div>
        <div><h3 className="mb-2 font-medium">Active CEP devices</h3>{detail.devices.length === 0 && <p className="text-sm">No active devices.</p>}{detail.devices.map(device => <div key={device.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span>{device.name || "Device"} · {device.os} · {when(device.last_seen_at)}</span><Button variant="outline" disabled={busy} onClick={() => setPending({ action: "revoke_device", label: `Revoke device ${device.name || device.id}`, device_id: device.id })}>Revoke</Button></div>)}</div>
        <div><h3 className="mb-2 font-medium">Recent management changes</h3>{detail.audit.map(entry => <p key={entry.id} className="mb-2 text-xs text-muted-foreground">{when(entry.created_at)} · {entry.actor} · {entry.action} · {entry.reason}</p>)}</div>
      </div>}
    </DialogContent></Dialog>
  </div>;
}
