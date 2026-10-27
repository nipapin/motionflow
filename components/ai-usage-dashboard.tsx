"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { AI_ACCOUNTS, AI_STATUSES, type AiUsageOverview, type AiUsageRow } from "@/lib/ai-usage-shared";
import { Button } from "@/components/ui/button";

const control = "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const num = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-US");
const seconds = (value: number | null | undefined) => value == null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} s`;
const label = (id: string) => AI_ACCOUNTS.find(account => account.id === id)?.label ?? "Unattributed";
const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
function localInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
function dates(days = 1) {
  const from = new Date(); from.setDate(from.getDate() - days + 1); from.setHours(0, 0, 0, 0);
  const to = new Date(); to.setDate(to.getDate() + 1); to.setHours(0, 0, 0, 0);
  return { from: localInput(from), to: localInput(to) };
}
type Filters = { from: string; to: string; account: string; model: string; status: string };
function query(filters: Filters, page: number) {
  return new URLSearchParams({ ...filters, from: new Date(filters.from).toISOString(),
    to: new Date(filters.to).toISOString(), page: String(page) }).toString();
}
function Status({ value }: { value: string }) {
  return <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs ${value === "failed" ? "text-red-400" : "text-muted-foreground"}`}>
    <span aria-hidden className={`size-1.5 rounded-full ${value === "succeeded" ? "bg-emerald-400" : value === "failed" ? "bg-red-400" : "bg-current"}`} />{value}
  </span>;
}
function ProviderLink({ row }: { row: AiUsageRow }) {
  return <a href={`https://replicate.com/p/${encodeURIComponent(row.id)}`} target="_blank" rel="noopener noreferrer"
    className="inline-flex items-center gap-1.5 rounded text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className="font-mono text-xs">{row.id.slice(0, 10)}…</span><ExternalLink aria-hidden className="size-3" />
    <span className="sr-only">View prediction {row.id} on Replicate (new tab)</span>
  </a>;
}

export function AiUsageDashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [initial] = useState<Filters>(() => ({ ...dates(), account: "", model: "", status: "" }));
  const [draft, setDraft] = useState(initial), [filters, setFilters] = useState(initial);
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<AiUsageOverview | null>(null), [busy, setBusy] = useState(true), [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(""), [syncError, setSyncError] = useState(""), [progress, setProgress] = useState("");
  const syncController = useRef<AbortController | null>(null);
  const requestQuery = query(filters, page);
  useEffect(() => {
    const ac = new AbortController(); setBusy(true); setError("");
    void fetch(`/api/admin/ai-usage?${requestQuery}`, { signal: ac.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load AI usage.");
        if (!ac.signal.aborted) setData(body as AiUsageOverview);
      }).catch(error => { if (!ac.signal.aborted) setError(error.message); })
      .finally(() => { if (!ac.signal.aborted) setBusy(false); });
    return () => ac.abort();
  }, [requestQuery, revision]);
  useEffect(() => () => syncController.current?.abort(), []);

  async function sync(restart: boolean) {
    const ac = new AbortController(); syncController.current = ac;
    setSyncing(true); setSyncError(""); setProgress("Reading Replicate history…");
    let imported = 0;
    try {
      let complete = false;
      do {
        const response = await fetch(`/api/admin/ai-usage?${query(filters, 1)}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restart }), signal: ac.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not sync Replicate history.");
        restart = false; imported += result.imported; complete = result.complete;
        setProgress(`${num(imported)} prediction records refreshed${complete ? ". Sync complete." : "…"}`);
        setRevision(value => value + 1);
      } while (!complete && !ac.signal.aborted);
    } catch (error) {
      if (!ac.signal.aborted) setSyncError(error instanceof Error ? error.message : "Could not sync Replicate history.");
      else setProgress("Sync stopped. Saved progress can be continued.");
    } finally {
      syncController.current = null; setSyncing(false); setRevision(value => value + 1);
    }
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    const start = Date.parse(draft.from), end = Date.parse(draft.to);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 366 * 86400000) {
      setError("Choose an end after the start, with a range of up to 366 days."); return;
    }
    setPage(1); setFilters({ ...draft, model: draft.model.trim() }); setFiltersOpen(false);
    setSyncError(""); setProgress("");
  }
  const totals = data?.totals;
  const value = (number: number | undefined) => busy && !data ? "…" : num(number);
  const unknown = data?.accounts.find(account => account.id === "unknown");
  const metrics = [
    { title: "Predictions", value: value(totals?.total), note: "Replicate model calls", lead: true },
    { title: "Succeeded", value: value(totals?.succeeded), note: `${num(totals?.failed)} failed · ${num(totals?.canceled)} canceled / aborted` },
    { title: "Compute time", value: busy && !data ? "…" : totals?.measured ? seconds(totals.predictSeconds) : "—", note: `${num(totals?.measured)} calls with runtime metrics` },
    { title: "Tokens", value: totals && (totals.inputMeasured || totals.outputMeasured) ? num(totals.inputTokens + totals.outputTokens) : "—",
      note: `${totals?.inputMeasured ? num(totals.inputTokens) : "—"} in · ${totals?.outputMeasured ? num(totals.outputTokens) : "—"} out` },
  ];
  if (!mounted) return <div><h1 className="text-2xl font-semibold tracking-tight">AI Usage</h1><p role="status" className="mt-4 text-sm text-muted-foreground">Loading generation history…</p></div>;
  return <div data-ui="ai-usage" className="min-w-0 space-y-6 pb-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">AI Usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">Replicate predictions across Motion Flow and author panels.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {syncing ? <Button variant="outline" size="sm" onClick={() => syncController.current?.abort()}>Stop sync</Button> : null}
        <Button variant="outline" size="sm" disabled={syncing || !data?.canSync || busy} onClick={() => void sync(!data?.sync.updatedAt || data.sync.complete)}>
          <RefreshCw aria-hidden className={`size-4 ${syncing ? "animate-spin motion-reduce:animate-none" : ""}`} />
          {syncing ? "Syncing…" : data?.sync.updatedAt && !data.sync.complete ? "Continue sync" : "Sync Replicate"}
        </Button>
      </div>
    </header>

    <section aria-label="Usage summary" aria-busy={busy} className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{stamp(new Date(filters.from).toISOString())} — {stamp(new Date(filters.to).toISOString())}</span>
        <span>{busy ? "Updating…" : data?.sync.updatedAt ? `Last import ${stamp(data.sync.updatedAt)}` : "Not imported yet"}</span>
      </div>
      <dl className="grid grid-cols-2 divide-x divide-border/50 border-y border-border/60 py-4 lg:grid-cols-4">
        {metrics.map((metric, i) => <div key={metric.title} className={`min-w-0 px-4 py-2 ${i === 0 ? "pl-0" : ""}`}>
          <dt className="text-xs text-muted-foreground">{metric.title}</dt>
          <dd className={`mt-1 font-mono tabular-nums ${metric.lead ? "text-3xl" : "text-2xl"}`}>{metric.value}</dd>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.note}</p>
        </div>)}
      </dl>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 xl:grid-cols-4">
        {AI_ACCOUNTS.map(account => {
          const usage = data?.accounts.find(item => item.id === account.id);
          return <div key={account.id} className="min-w-0 border-b border-border/50 pb-3">
            <div className="flex items-center justify-between gap-2 text-sm"><span>{account.label}</span><span className="font-mono tabular-nums">{num(usage?.total)}</span></div>
            <p className="mt-1 hidden truncate font-mono text-[11px] leading-5 text-muted-foreground sm:block" title={account.env}>{account.env}</p>
            <p className="mt-1 text-xs text-muted-foreground">{usage?.configured ? "Key configured" : data ? "Key missing" : "Checking key…"} · {usage?.measured ? seconds(usage.predictSeconds) : "—"}</p>
          </div>;
        })}
      </div>
      {unknown?.total ? <p className="text-xs leading-5 text-muted-foreground">{num(unknown.total)} historical predictions are unattributed. Replicate does not return the API key used; author attribution starts when tracking is enabled.</p> : null}
      {data && !data.canSync ? <p className="text-sm text-muted-foreground">Set REPLICATE_API_TOKEN on the server to import history. Recorded panel usage remains available.</p> : null}
      {data && !data.sync.complete ? <p className="text-xs text-muted-foreground">{data.sync.updatedAt ? "History import is incomplete for this period. Totals include only records imported or tracked so far." : "History has not been imported for this period. Use Sync Replicate to load it."}</p> : null}
      {progress ? <p role="status" className="text-xs text-muted-foreground">{progress}</p> : null}
      {syncError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{syncError}</p><Button variant="outline" size="sm" disabled={syncing} onClick={() => void sync(false)}>Retry sync</Button></div> : null}
    </section>

    <section aria-labelledby="ai-filters-heading" className="border-b border-border/60 pb-5">
      <div className="mb-3 flex items-center justify-between"><h2 id="ai-filters-heading" className="text-sm font-medium">Filters</h2>
        <button type="button" className="min-h-11 rounded px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring md:hidden" aria-expanded={filtersOpen} aria-controls="ai-usage-filters" onClick={() => setFiltersOpen(value => !value)}>{filtersOpen ? "Hide filters" : "Edit filters"}</button>
        <span className="hidden text-xs text-muted-foreground md:inline">Dates and times in your browser timezone · End time excluded</span>
      </div>
      <form id="ai-usage-filters" onSubmit={apply} className={`${filtersOpen ? "grid" : "hidden"} gap-3 md:grid md:grid-cols-2 xl:grid-cols-6`}>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground">From<input type="datetime-local" step="1" required className={control} value={draft.from} disabled={syncing} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground">To<input type="datetime-local" step="1" required className={control} value={draft.to} disabled={syncing} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground">Author / key<select className={control} disabled={syncing} value={draft.account} onChange={e => setDraft({ ...draft, account: e.target.value })}>
          <option value="">All authors</option>{AI_ACCOUNTS.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}<option value="unknown">Unattributed</option>
        </select></label>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground">Model<input list="ai-usage-models" className={control} placeholder="All models" value={draft.model} disabled={syncing} onChange={e => setDraft({ ...draft, model: e.target.value })} />
          <datalist id="ai-usage-models">{data?.models.map(model => <option key={model} value={model} />)}</datalist></label>
        <label className="min-w-0 space-y-1.5 text-xs text-muted-foreground">Status<select className={control} disabled={syncing} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>
          <option value="">All statuses</option>{AI_STATUSES.map(status => <option key={status}>{status}</option>)}
        </select></label>
        <div className="flex items-end"><Button type="submit" className="h-10 w-full" disabled={syncing}>Apply filters</Button></div>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-6">
          {[1, 7, 30].map(days => <button key={days} type="button" disabled={syncing} className="min-h-9 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" onClick={() => setDraft({ ...draft, ...dates(days) })}>{days === 1 ? "Today" : `Last ${days} days`}</button>)}
          <span className="text-xs text-muted-foreground md:hidden">Times use your browser timezone; end excluded.</span>
        </div>
      </form>
    </section>

    <section aria-labelledby="ai-journal-heading" aria-busy={busy} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id="ai-journal-heading" className="text-base font-medium">Generation journal</h2>
        <p className="text-xs text-muted-foreground">{num(data?.total)} predictions{totals?.active ? ` · ${num(totals.active)} in progress` : ""}</p></div>
      {error ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4 text-sm"><p>{error}</p><Button size="sm" variant="outline" onClick={() => setRevision(value => value + 1)}>Retry</Button></div> : null}
      {busy && !data ? <p role="status" className="py-8 text-sm text-muted-foreground">Loading generation history…</p> : null}
      {data && !data.rows.length ? <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">No predictions match this period and these filters.{!data.sync.complete ? " Sync Replicate to import available history." : ""}</div> : null}
      {data?.rows.length ? <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-sm"><thead className="sticky top-0 bg-background text-xs text-muted-foreground"><tr>
          {[["Model / prediction", false], ["Author", false], ["Status", false], ["Created", true], ["Compute", true], ["Tokens in / out", true]].map(([text, right]) => <th scope="col" key={String(text)} className={`whitespace-nowrap py-3 pr-4 font-normal last:pr-0 ${right ? "text-right" : "text-left"}`}>{text}</th>)}
        </tr></thead><tbody className="divide-y divide-border/40">{data.rows.map(row => <tr key={row.id} className="align-top">
          <td className="max-w-72 py-3 pr-4"><p className="truncate" title={row.model}>{row.model}</p><div className="mt-1"><ProviderLink row={row} /></div></td>
          <td className="whitespace-nowrap py-3 pr-4"><p>{label(row.account)}</p><p className="mt-1 text-xs text-muted-foreground">{row.userRef || "No linked user"}</p></td>
          <td className="py-3 pr-4"><Status value={row.status} /></td>
          <td className="whitespace-nowrap py-3 pr-4 text-right text-xs tabular-nums">{stamp(row.createdAt)}<p className="mt-1 text-muted-foreground">{row.completedAt ? `Done ${new Date(row.completedAt).toLocaleTimeString()}` : "—"}</p></td>
          <td className="whitespace-nowrap py-3 pr-4 text-right font-mono text-xs tabular-nums">{seconds(row.predictSeconds)}<p className="mt-1 text-muted-foreground">{seconds(row.totalSeconds)} total</p></td>
          <td className="whitespace-nowrap py-3 text-right font-mono text-xs tabular-nums">{num(row.inputTokens)} / {num(row.outputTokens)}</td>
        </tr>)}</tbody></table></div>
        <ul className="divide-y divide-border/50 md:hidden">{data.rows.map(row => <li key={row.id} className="space-y-2 py-4">
          <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm">{row.model}</p><Status value={row.status} /></div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{label(row.account)} · {row.userRef || "No linked user"}</span><span className="tabular-nums">{seconds(row.predictSeconds)}</span></div>
          <p className="text-xs text-muted-foreground">{stamp(row.createdAt)} · {seconds(row.totalSeconds)} total · {num(row.inputTokens)} / {num(row.outputTokens)} tokens</p>
          <ProviderLink row={row} />
        </li>)}</ul>
      </> : null}
      {data && data.total > 0 ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4 text-xs text-muted-foreground">
        <span>{num((page - 1) * 50 + 1)}–{num(Math.min(page * 50, data.total))} of {num(data.total)}</span>
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1 || busy} onClick={() => setPage(value => value - 1)}><ChevronLeft aria-hidden className="size-4" />Previous</Button>
          <Button variant="outline" size="sm" disabled={page * 50 >= data.total || busy} onClick={() => setPage(value => value + 1)}>Next<ChevronRight aria-hidden className="size-4" /></Button></div>
      </div> : null}
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Each model call is one prediction; a single panel action may call multiple models. Runtime and tokens are provider metrics, not billed cost. Replicate may remove prediction inputs and outputs after one hour.</p>
    </section>
  </div>;
}
