"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, X } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { MARKET_ACTION_LABELS, type MarketAction, type MarketOverview, type MarketResource } from "@/lib/market-analytics-shared";
import { activityActionLabels, activityToolLabels, activityStatusLabels, type ActivityStatus } from "@/lib/user-activity-shared";
import { MarketHeatmapPanel } from "@/components/market-heatmap-panel";
import { AdminUserDrawer } from "@/components/admin-user-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const control = "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const cell = "whitespace-nowrap px-3 py-3 text-right tabular-nums";
const names = (row: { type: string; id: string; name: string }) => row.type === "tool" ? activityToolLabels[row.id] || row.name : row.name;
const initialDates = () => ({ from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) });

export function MarketAnalyticsDashboard() {
  const [dates, setDates] = useState(initialDates), [tab, setTab] = useState("overview");
  const [search, setSearch] = useState(""), [querySearch, setQuerySearch] = useState("");
  const [source, setSource] = useState(""), [action, setAction] = useState(""), [sort, setSort] = useState("downloads"), [page, setPage] = useState(1);
  const [scope, setScope] = useState("");
  const [resource, setResource] = useState<MarketResource | null>(null), [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [data, setData] = useState<MarketOverview | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null), [revision, setRevision] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQuerySearch(search); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const query = useMemo(() => {
    const params = new URLSearchParams({ ...dates, page: String(page), sort });
    if (querySearch) params.set("search", querySearch); if (source) params.set("source", source); if (action) params.set("action", action);
    if (scope) params.set("scope", scope);
    if (resource) { params.set("resourceType", resource.type); params.set("resourceId", resource.id); }
    return params.toString();
  }, [dates, page, sort, querySearch, source, action, resource, scope]);
  useEffect(() => {
    if (tab === "heatmap") return;
    const ac = new AbortController(); setBusy(true); setError(null);
    void fetch(`/api/admin/analytics?${query}`, { signal: ac.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(response.status === 400 ? "Choose a valid date range of up to one year, ending today or earlier." : "Could not load marketplace analytics. Refresh to try again.");
      const next = await response.json() as MarketOverview; if (!ac.signal.aborted) setData(next);
    }).catch(err => { if (!ac.signal.aborted) setError(err.message); }).finally(() => { if (!ac.signal.aborted) setBusy(false); });
    return () => ac.abort();
  }, [query, revision, tab]);
  const chooseResource = (row: MarketResource) => { setResource(row); setPage(1); setTab("activity"); };
  const total = tab === "activity" ? data?.eventTotal || 0 : data?.resourceTotal || 0;
  const pager = <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-muted-foreground"><span>{total.toLocaleString()} {tab === "activity" ? "events" : "materials / tools"} · Page {page}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || busy} onClick={() => setPage(value => value - 1)}><ChevronLeft className="size-4" /> Previous</Button><Button size="sm" variant="outline" disabled={page * 50 >= total || busy} onClick={() => setPage(value => value + 1)}>Next <ChevronRight className="size-4" /></Button></div></div>;
  const empty = !busy && !error && data && !data.eventTotal;
  return (
    <div className="space-y-6 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">Market analytics</h1><p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Understand what people choose, download and buy. Start with the material, then see who used it.</p></div>
        {tab !== "heatmap" ? <Button variant="outline" size="sm" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw className="size-4" /> Refresh</Button> : null}
      </header>
      <div className="flex flex-wrap items-end gap-3 border-y border-border/60 py-4">
        <label className="grid gap-1.5 text-xs font-medium">From<input type="date" aria-label="From date" className={control} value={dates.from} max={dates.to} onChange={event => { setDates(value => ({ ...value, from: event.target.value })); setPage(1); }} /></label>
        <label className="grid gap-1.5 text-xs font-medium">To<input type="date" aria-label="To date" className={control} value={dates.to} min={dates.from} max={initialDates().to} onChange={event => { setDates(value => ({ ...value, to: event.target.value })); setPage(1); }} /></label>
        <div className="flex gap-1">{[7, 30, 90].map(days => <Button key={days} variant="ghost" size="sm" onClick={() => { setDates({ from: new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10), to: initialDates().to }); setPage(1); }}>{days}d</Button>)}</div>
        {tab !== "heatmap" ? <>
          <label className="grid gap-1.5 text-xs font-medium">Area<select className={control} value={scope} onChange={event => { setScope(event.target.value); setPage(1); }}><option value="">Market, extensions & AI</option><option value="market">Marketplace materials</option><option value="extensions">Extension packs & files</option><option value="ai">AI tools</option></select></label>
          <label className="grid gap-1.5 text-xs font-medium">Source<select className={control} value={source} onChange={event => { setSource(event.target.value); setPage(1); }}><option value="">All sources</option><option value="web">Website</option><option value="extension">Extensions</option><option value="unknown">Legacy / unknown</option></select></label>
          <label className="grid gap-1.5 text-xs font-medium">Action<select className={control} value={action} onChange={event => { setAction(event.target.value); setPage(1); }}><option value="">All actions</option>{Object.entries(MARKET_ACTION_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
          <label className="relative min-w-48 flex-1"><span className="sr-only">Search materials or users</span><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="h-9 pl-9" placeholder="Material, tool, user or email" value={search} onChange={event => setSearch(event.target.value)} /></label>
        </> : null}
      </div>
      <nav aria-label="Analytics views" className="flex flex-wrap gap-1 border-b border-border">
        {[["overview", "Overview"], ["materials", "Materials & tools"], ["activity", "All activity"], ["heatmap", "Page heatmaps"]].map(([key, label]) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined} className={cn("border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")} onClick={() => { setTab(key); setPage(1); }}>{label}</button>)}
      </nav>
      {resource && tab !== "heatmap" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted px-4 py-3"><div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Back to all materials" onClick={() => { setResource(null); setPage(1); }}><ArrowLeft className="size-4" /></button><span className="break-words text-sm">Showing <strong>{names(resource)}</strong></span></div><Button variant="ghost" size="sm" onClick={() => { setResource(null); setPage(1); }}><X className="size-4" /> Clear material</Button></div> : null}
      {tab === "heatmap" ? <MarketHeatmapPanel from={dates.from} to={dates.to} /> : <>
        {error ? <p role="alert" className="rounded-md border border-destructive/30 p-4 text-sm">{error}</p> : null}
        {busy ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Updating analytics…</p> : null}
        {data?.unavailableSources.length ? <p role="status" className="text-sm text-muted-foreground">Some historical sources are unavailable: {data.unavailableSources.join(", ")}.</p> : null}
        {empty ? <div className="rounded-lg border border-dashed border-border p-8"><BarChart3 className="mb-3 size-6 text-muted-foreground" /><h2 className="font-semibold">No activity for these filters</h2><p className="mt-2 text-sm text-muted-foreground">Try a wider period or clear the material, action and source filters. Views and selections start collecting after this update; older downloads and purchases are included where available.</p></div> : null}
        {data && !error ? <>
          {tab === "overview" ? <>
            <dl className="grid grid-cols-2 divide-x divide-border/60 gap-y-5 lg:grid-cols-4 xl:grid-cols-7">
              {(["view", "select", "favorite", "download", "purchase", "generation", "extension"] as MarketAction[]).map(key => <div key={key} className="px-4 first:pl-0"><dt className="text-xs text-muted-foreground">{MARKET_ACTION_LABELS[key]}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{data.totals[key].toLocaleString()}</dd></div>)}
            </dl>
            <p className="text-xs leading-relaxed text-muted-foreground">{data.totals.users.toLocaleString()} identified users · {data.totals.failures.toLocaleString()} failed actions. Purchases count paid, currently active item licenses, excluding free grants. Legacy downloads are requests; new downloads mean a file or link was issued. Views and selections have no historical backfill.</p>
            <section className="space-y-4 border-y border-border/60 py-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Demand over time</h2><span className="text-xs text-muted-foreground">Database dates · counts, not a matched-user conversion funnel</span></div>
              <div className="h-64 w-full" aria-label="Daily views, downloads, purchases and AI usage">
                <ResponsiveContainer width="100%" height="100%"><LineChart data={data.daily} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={day => day.slice(5)} minTickGap={25} /><YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={40} allowDecimals={false} /><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />{[["view", "#60a5fa"], ["download", "#a78bfa"], ["purchase", "#34d399"], ["generation", "#fbbf24"]].map(([key, color]) => <Line key={key} name={MARKET_ACTION_LABELS[key as MarketAction]} dataKey={key} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />)}</LineChart></ResponsiveContainer>
              </div><div className="flex flex-wrap gap-4 text-xs text-muted-foreground">{[["Views", "bg-blue-400"], ["Downloads", "bg-violet-400"], ["Purchases", "bg-emerald-400"], ["AI tools", "bg-amber-400"]].map(([label, color]) => <span key={label} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", color)} />{label}</span>)}</div>
            </section>
          </> : null}
          {tab !== "activity" ? <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{resource ? "Selected material" : "Materials & tools ranked by demand"}</h2><label className="flex items-center gap-2 text-xs text-muted-foreground">Sort by<select className={control} value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}>{[["downloads", "Downloads"], ["purchases", "Purchases"], ["views", "Views"], ["selections", "Selections"], ["favorites", "Saved"], ["generations", "AI usage"], ["extensions", "Extension activity"], ["users", "Users"], ["lastAt", "Recent activity"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <div className="overflow-x-auto rounded-lg border border-border/60"><table className="w-full text-sm"><thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground"><tr><th className="min-w-64 px-4 py-3 text-left font-medium">Material / tool</th>{["Views", "Selected", "Saved", "Downloads", "Purchases", "AI / extension", "Users"].map(label => <th key={label} className={cn(cell, "font-medium")}>{label}</th>)}</tr></thead><tbody className="divide-y divide-border/50">{data.resources.map(row => <tr key={`${row.type}:${row.id}`} className="hover:bg-muted/30"><td className="px-4 py-3"><button className="text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => chooseResource(row)}>{names(row)}</button><p className="mt-1 text-xs text-muted-foreground">{row.type.replaceAll("_", " ")} · #{row.id}</p></td>{[row.views, row.selections, row.favorites, row.downloads, row.purchases, row.generations + row.extensions, row.users].map((value, index) => <td key={index} className={cell}>{value.toLocaleString()}</td>)}</tr>)}</tbody></table></div>{pager}
          </section> : <>
            <section className="space-y-3"><h2 className="font-semibold">{resource ? "People interacting with this material" : "People in this selection"}</h2><div className="flex flex-wrap gap-2">{data.users.slice(0, 12).map(user => <button key={user.id ?? "anonymous"} disabled={user.id === null} onClick={() => setSelectedUser(user.id)} className="rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"><span className="font-medium">{user.name}</span><span className="ml-2 text-xs tabular-nums text-muted-foreground">{user.actions} actions · {user.downloads} downloads · {user.purchases} purchases</span></button>)}</div></section>
            <div className="overflow-x-auto rounded-lg border border-border/60"><table className="w-full text-sm"><thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground"><tr>{["When", "Action", "Material / tool", "Who", "Source / result"].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-border/50">{data.events.map(event => <tr key={event.id} className="hover:bg-muted/30"><td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted-foreground">{event.at}</td><td className="px-4 py-3">{activityActionLabels[event.detail] || MARKET_ACTION_LABELS[event.action]}</td><td className="min-w-52 px-4 py-3"><button className="text-left font-medium hover:underline" onClick={() => chooseResource({ type: event.resourceType, id: event.resourceId || "", name: event.resourceName } as MarketResource)}>{event.resourceType === "tool" ? activityToolLabels[event.resourceId || ""] || event.resourceName : event.resourceName}</button></td><td className="min-w-40 px-4 py-3">{event.userId ? <button className="text-left hover:underline" onClick={() => setSelectedUser(event.userId)}>{event.userName || `Account #${event.userId}`}<span className="block text-xs text-muted-foreground">{event.userEmail}</span></button> : <span className="text-muted-foreground">Anonymous visitor</span>}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{event.source === "web" ? "Website" : event.source === "extension" ? "Extension" : "Source not recorded"}<span className={cn("mt-1 block", event.status === "failed" && "font-medium text-foreground")}>{event.status === "observed" && ["view", "select", "favorite"].includes(event.action) ? "Recorded" : activityStatusLabels[event.status as ActivityStatus] || event.status}</span></td></tr>)}</tbody></table></div>{pager}
          </>}
        </> : null}
      </>}
      <AdminUserDrawer userId={selectedUser} initialTab="activity" onOpenChange={open => { if (!open) setSelectedUser(null); }} onUserUpdated={() => setRevision(value => value + 1)} onUserDeleted={() => { setSelectedUser(null); setRevision(value => value + 1); }} />
    </div>
  );
}
