"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Balance = { authorId: number; extensionName: string; extraBalance: number };
export function AuthorExtraGenerations({ authorId, userId }: { authorId: number; userId: number }) {
  const id = useId();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);
  const request = useRef<{ key: string; id: string } | null>(null);
  const mounted = useRef(true);
  const endpoint = `/api/extensions/${authorId}/users/${userId}/generation-credits`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch(endpoint, { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (data.error === "AUTHOR_CREDITS_UNAVAILABLE") { if (!controller.signal.aborted) setSupported(false); return; }
        if (!response.ok) throw new Error("Could not load extra generations.");
        if (!controller.signal.aborted) setBalance(data);
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, reload]);

  const count = Number(amount);
  const valid = /^\d+$/.test(amount) && Number.isSafeInteger(count) && count > 0 && count <= 1_000_000;
  async function add() {
    if (!valid || !balance || saving) return;
    const key = JSON.stringify([authorId, userId, count, note.trim()]);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    const requestId = request.current.id;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: count, note: note.trim(), requestId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === "BALANCE_LIMIT" ? "The maximum extra-generation balance has been reached." : "Could not add generations. Retry to check this request safely.");
      if (!mounted.current) return;
      setBalance(data);
      setSuccess(data.duplicate ? `This grant was already applied. Extra balance: ${data.extraBalance}.` : `Added ${count.toLocaleString("en-US")} extra generations to ${data.extensionName}.`);
      setAmount(""); setNote(""); request.current = null;
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : "Could not add generations."); }
    finally { if (mounted.current) setSaving(false); }
  }
  if (!supported) return null;
  return <section aria-label="Author extra generations" className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Sparkles className="size-4 text-blue-400" /><h3 className="text-sm font-semibold">Extra generations</h3></div><span aria-live="polite" className="text-sm font-semibold tabular-nums text-blue-400">{loading ? "…" : balance ? balance.extraBalance.toLocaleString("en-US") : "—"} <span className="text-xs font-normal text-muted-foreground">available</span></span></div>
    <p className="text-xs leading-5 text-muted-foreground">{balance?.extensionName ?? "This author’s extension"} only. These credits do not expire and are added to the current balance. Subscription access stays unchanged.</p>
    <div className="space-y-2"><Label htmlFor={`${id}-amount`} className="text-xs">Generations to add</Label><div className="flex items-center gap-2"><Input id={`${id}-amount`} type="number" inputMode="numeric" min={1} max={1_000_000} step={1} placeholder="e.g. 100" value={amount} onChange={event => { setAmount(event.target.value); setSuccess(""); }} disabled={saving || loading || !balance} className="min-w-0 flex-1" /><Button type="button" disabled={!valid || saving || loading || !balance} onClick={() => void add()} className="shrink-0 bg-linear-to-r from-blue-600 to-blue-500 text-white">{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}Add generations</Button></div></div>
    <div className="space-y-2"><Label htmlFor={`${id}-note`} className="text-xs">Note <span className="font-normal text-muted-foreground">(optional, admin log)</span></Label><Input id={`${id}-note`} maxLength={500} placeholder="Reason for this grant" value={note} onChange={event => setNote(event.target.value)} disabled={saving} /></div>
    {valid && balance && <p className="text-xs text-muted-foreground">New extra balance: <span className="font-medium text-foreground">{(balance.extraBalance + count).toLocaleString("en-US")}</span></p>}
    {error && <div role="alert" className="text-xs text-destructive">{error}{!balance && <Button type="button" size="sm" variant="ghost" onClick={() => setReload(value => value + 1)}><RefreshCw className="mr-1 size-3" />Retry</Button>}</div>}
    {success && <p role="status" className="text-xs text-emerald-500">{success} Refresh the balance in the extension to see it.</p>}
  </section>;
}
