"use client";
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { HeatKind, HeatReport } from "@/lib/market-analytics-shared";
import { Button } from "@/components/ui/button";

const control = "h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export function MarketHeatmapPanel({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<HeatReport | null>(null), [selection, setSelection] = useState("");
  const [kind, setKind] = useState<HeatKind>("click"), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0), [height, setHeight] = useState(1600), [previewWidth, setPreviewWidth] = useState(800);
  const frame = useRef<HTMLIFrameElement>(null), canvas = useRef<HTMLCanvasElement>(null), container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ac = new AbortController(); setBusy(true); setError(null);
    const query = new URLSearchParams({ from, to, view: "heatmap" });
    if (selection) { const chosen = JSON.parse(selection); query.set("path", chosen.path); query.set("width", String(chosen.width)); query.set("layout", chosen.layout); }
    void fetch(`/api/admin/analytics?${query}`, { signal: ac.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Could not load heatmaps. Try again.");
      const next = await response.json() as HeatReport; if (!ac.signal.aborted) setData(next);
    }).catch(err => { if (!ac.signal.aborted) setError(err.message); }).finally(() => { if (!ac.signal.aborted) setBusy(false); });
    return () => ac.abort();
  }, [from, to, selection, refresh]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    observer.observe(container.current); return () => observer.disconnect();
  }, [data?.selected?.path, data?.selected?.width]);
  const selected = data?.selected, width = selected?.width || 1440;
  const scale = Math.min(1, previewWidth / width);
  useEffect(() => {
    const node = canvas.current, context = node?.getContext("2d");
    if (!node || !context) return;
    node.width = Math.round(width * scale); node.height = Math.round(height * scale);
    context.clearRect(0, 0, node.width, node.height);
    const cells = data?.cells.filter(cell => cell.kind === kind) || [], max = Math.max(1, ...cells.map(cell => cell.weight));
    for (const cell of cells) {
      const x = (cell.x + .5) / 40 * node.width, y = (cell.y + .5) / 200 * node.height;
      const radius = Math.max(12, width / 40 * scale * 1.4), intensity = Math.sqrt(cell.weight / max);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255,45,0,${.2 + intensity * .65})`);
      gradient.addColorStop(.4, `rgba(255,180,0,${intensity * .5})`);
      gradient.addColorStop(1, "rgba(30,120,255,0)");
      context.fillStyle = gradient; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }, [data, kind, width, height, scale]);
  const onFrameLoad = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    // Preview is read-only; visitor tracking is disabled in embedded documents.
    const measure = () => setHeight(Math.min(16000, Math.max(900, doc.documentElement.scrollHeight)));
    measure(); void doc.fonts?.ready.then(measure);
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-[1_1_24rem] gap-1.5 text-xs font-medium">Page · viewport · layout version
          <select className={`${control} w-full min-w-0 max-w-full`} disabled={busy || !data?.pages.length} value={selected ? JSON.stringify({ path: selected.path, width: selected.width, layout: selected.layout }) : ""}
            onChange={event => { setSelection(event.target.value); setHeight(1600); }}>
            {!data?.pages.length ? <option value="">No page data yet</option> : null}
            {data?.pages.map(page => <option key={`${page.path}:${page.width}:${page.layout}`} value={JSON.stringify({ path: page.path, width: page.width, layout: page.layout })}>
              {page.path} · {page.width}px · {page.layout} · {page.visits} sampled visits
            </option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">Layer
          <select className={control} value={kind} onChange={event => setKind(event.target.value as HeatKind)}>
            <option value="click">Clicks / taps</option><option value="move">Cursor movement</option><option value="dwell">Cursor dwell</option>
          </select>
        </label>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh</Button>
      </div>
      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">Aggregated interaction density from sampled public-page visits. Cursor dwell is a proxy for interaction, not eye tracking. Screen widths and layout versions are kept separate. The overlay uses the current page; dynamic content can shift its alignment.</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {busy ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading heatmap…</p> : null}
      {!busy && !selected ? <div className="rounded-lg border border-dashed border-border p-8 text-center"><p className="font-medium">Heatmaps start with new visits</p><p className="mt-2 text-sm text-muted-foreground">Once sampled visitors interact with public pages, choose a page here to see clicks, movement, dwell and scroll depth. Admin visits are excluded.</p></div> : null}
      {selected ? <>
        {!data?.cells.some(cell => cell.kind === kind) ? <p role="status" className="text-sm text-muted-foreground">No {kind === "dwell" ? "cursor dwell" : kind === "move" ? "cursor movement" : "clicks or taps"} captured for this page, width and period.</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span><strong className="tabular-nums">{data?.visits.toLocaleString()}</strong> sampled visits · warmer areas indicate more interaction</span>
          <a href={selected.path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">Open current page <ExternalLink className="size-3.5" /></a>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div ref={container} className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted">
            <div className="relative max-h-[720px] overflow-auto">
              <div style={{ width: width * scale, height: height * scale, position: "relative" }}>
                <iframe key={`${selected.path}:${selected.width}`} ref={frame} src={selected.path} title={`Read-only preview of ${selected.path}`} tabIndex={-1} onLoad={onFrameLoad}
                  style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left", border: 0, pointerEvents: "none" }} />
                <canvas ref={canvas} aria-label={`${kind} heatmap, ${data?.cells.filter(cell => cell.kind === kind).length || 0} occupied cells`} className="pointer-events-none absolute inset-0" style={{ width: width * scale, height: height * scale }} />
              </div>
            </div>
          </div>
          <aside className="space-y-4">
            <h3 className="text-sm font-semibold">Scroll reach</h3>
            {data?.scroll.map(row => <div key={row.depth} className="space-y-1.5"><div className="flex justify-between text-xs"><span>{row.depth}% of page</span><span className="tabular-nums">{data.visits ? Math.round(row.visits / data.visits * 100) : 0}%</span></div><div className="h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${data.visits ? row.visits / data.visits * 100 : 0}%` }} /></div></div>)}
            <p className="text-xs leading-relaxed text-muted-foreground">Share of sampled visits reaching this depth. The initially visible part of a short page can already include its end.</p>
          </aside>
        </div>
      </> : null}
    </div>
  );
}
