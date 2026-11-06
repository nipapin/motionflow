"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Options = { extensionName: string; packs: { id: number; name: string; host: string | null }[] };
type Preview = { id: string; amount: number; note: string; total: number; completed: number; done: boolean };
const messages: Record<string, string> = {
  BATCH_TOO_LARGE: "More than 10,000 users match. Narrow the filters and preview again.",
  BATCH_EXPIRED: "This operation has expired. Check its audit history before creating another grant.",
  BATCH_BUSY: "This operation is still running. Wait a moment and retry.",
  INVALID_FILTERS: "Check the user filters and preview again.",
  INVALID_PACKS: "The selected packs have changed. Reopen the form and select them again.",
};

export function AuthorBulkGenerations({ authorId, query, disabled }: { authorId: number; query: string; disabled: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(true);
  const [options, setOptions] = useState<Options | null>(null);
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");
  const [packIds, setPackIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const endpoint = `/api/extensions/${authorId}/users/generation-credits`;
  const storageKey = `mf-credit-batch:${authorId}`;
  const count = Number(amount);
  const valid = /^\d+$/.test(amount) && Number.isSafeInteger(count) && count > 0 && count <= 1_000_000;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (response.status === 404) { setSupported(false); setOpen(false); return; }
      if (!response.ok) throw new Error("Could not load packs. Close the form and try again.");
      const data = await response.json();
      if (!controller.signal.aborted) setOptions(data);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [open, endpoint]);

  async function post(body: unknown): Promise<Preview> {
    const response = await fetch(endpoint, { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(messages[data.error] ?? "Could not finish this request. Retry this operation to continue safely.");
    return data;
  }
  async function makePreview() {
    if (!valid || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { setPreview(await post({ action: "preview", query, amount: count, note: note.trim(), packIds })); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not preview recipients."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function apply() {
    if (!preview || pending.current) return;
    pending.current = true; setBusy(true); setStarted(true); setError("");
    try {
      // Keep the operation ID across a page reload; no new grant is created on retry.
      persist(preview);
      let progress = preview;
      do {
        progress = await post({ action: "apply", batchId: progress.id });
        setPreview(progress);
        persist(progress);
      } while (!progress.done);
      try { localStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
    } catch (error) { setError(error instanceof Error ? error.message : "Could not finish this operation."); }
    finally { pending.current = false; setBusy(false); }
  }
  function persist(batch: Preview) {
    try { localStorage.setItem(storageKey, JSON.stringify(batch)); } catch { /* An open form can continue without storage. */ }
  }
  function show() {
    setError(""); setOpen(true);
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) { const batch = JSON.parse(saved) as Preview; setPreview(batch); setStarted(true); }
    } catch { /* Storage may be unavailable; server-side request IDs still prevent duplicate grants. */ }
  }
  if (!supported) return null;
  return <>
    <Button type="button" size="sm" variant="outline" className="gap-2" disabled={disabled} onClick={show}><Sparkles className="size-4" />Add generations</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Add extra generations</DialogTitle><DialogDescription>{options?.extensionName ?? "This author"} only. Uses all users matching the current filters across every page.</DialogDescription></DialogHeader>
        {!started ? <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor={`${id}-amount`}>Generations per user</Label><Input id={`${id}-amount`} type="number" inputMode="numeric" min={1} max={1000000} step={1} value={amount} disabled={busy} onChange={event => { setAmount(event.target.value); setPreview(null); }} /></div>
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="mb-2 text-sm font-medium">Purchased packs <span className="font-normal text-muted-foreground">(optional)</span></legend>
            <p className="text-xs leading-5 text-muted-foreground">Select packs to include buyers of any selected pack. Each user receives the bonus once, even if they own several. Leave empty to use only the current user filters.</p>
            {!options ? <p role="status" className="text-sm text-muted-foreground">Loading packs…</p> : options.packs.map(pack => <label key={pack.id} className="flex cursor-pointer items-center gap-3 py-1 text-sm"><Checkbox checked={packIds.includes(pack.id)} onCheckedChange={checked => { setPackIds(previous => checked === true ? [...previous, pack.id] : previous.filter(value => value !== pack.id)); setPreview(null); }} />{pack.name}{pack.host ? ` · ${pack.host}` : ""}</label>)}
          </fieldset>
          <div className="space-y-2"><Label htmlFor={`${id}-note`}>Internal note</Label><Input id={`${id}-note`} value={note} maxLength={500} disabled={busy} placeholder="Reason for this grant" onChange={event => { setNote(event.target.value); setPreview(null); }} /></div>
        </div> : null}
        {preview ? <div role="status" aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="font-medium">{preview.total.toLocaleString()} users × {preview.amount.toLocaleString()} generations</p>
          <p className="text-muted-foreground">{preview.done && started ? "Completed. Each matching user has received this grant once." : started ? `Processed ${preview.completed.toLocaleString()} of ${preview.total.toLocaleString()}. Keep this form open to finish.` : `Total: ${(preview.total * preview.amount).toLocaleString()} extra generations. Recipients are fixed for this operation.`}</p>
          {preview.note ? <p className="break-words text-muted-foreground">{preview.note}</p> : null}
        </div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          {preview?.done && started ? <Button type="button" onClick={() => { setOpen(false); setPreview(null); setStarted(false); }}>Done</Button> : <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{started ? "Close and resume later" : "Cancel"}</Button>
            {!started ? <Button type="button" variant={preview ? "outline" : "default"} disabled={busy || !valid || !options} onClick={() => void makePreview()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Preview recipients</Button> : null}
            {preview && preview.total > 0 ? <Button type="button" disabled={busy} onClick={() => void apply()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}{started ? "Resume operation" : `Add ${preview.amount} to ${preview.total} users`}</Button> : null}
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
