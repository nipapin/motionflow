"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CepApplyStatus, CepDiagnosticDetail, CepDiagnosticList } from "@/lib/cep-diagnostics-shared";

const statusLabels: Record<CepApplyStatus, string> = { applied: "Applied", failed: "Failed", "media-missing": "Media missing" };
const sections = ["logs", "environment", "settings", "result"] as const;
type Section = typeof sections[number];
function date(value: string) { return new Date(value).toLocaleString(); }
function Status({ value }: { value: CepApplyStatus }) {
  return <span className={value === "failed" ? "text-red-700 dark:text-red-300" : value === "media-missing" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>{statusLabels[value]}</span>;
}
function download(report: CepDiagnosticDetail) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = `cep-${report.reportId}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CepDiagnostics() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [days, setDays] = useState("7");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [list, setList] = useState<CepDiagnosticList | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CepDiagnosticDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [section, setSection] = useState<Section>("logs");
  const detailRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    const params = new URLSearchParams({ q: query, status, days, page: String(page) });
    void (async () => {
      try {
        const response = await fetch(`/api/admin/cep-diagnostics?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load reports");
        if (!controller.signal.aborted) setList(body as CepDiagnosticList);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load reports");
      } finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [query, status, days, page, refresh]);
  useEffect(() => () => detailRequest.current?.abort(), []);

  async function openReport(id: string) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setSelected(id); setDetail(null); setDetailError(""); setSection("logs");
    try {
      const response = await fetch(`/api/admin/cep-diagnostics/${id}`, { signal: controller.signal, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load this report");
      if (!controller.signal.aborted) setDetail(body as CepDiagnosticDetail);
    } catch (err) { if (!controller.signal.aborted) setDetailError(err instanceof Error ? err.message : "Could not load this report"); }
  }

  const reports = list?.reports || [];
  const jsonSection = detail ? section === "settings" ? detail.payload.context.settings : section === "result" ? detail.payload.result : detail.payload.context : null;

  return <section className="space-y-6" aria-labelledby="cep-diagnostics-title">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 id="cep-diagnostics-title" className="text-2xl font-semibold tracking-tight">CEP diagnostics</h1><p className="mt-1 text-sm text-muted-foreground">Gal Toolkit MAX · Reports after each element apply</p></div>
      <Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)} disabled={busy}><RefreshCw className="mr-2 size-4" aria-hidden />Refresh</Button>
    </header>

    <div className="flex flex-wrap items-end gap-3">
      <form className="flex min-w-0 flex-1 gap-2 sm:max-w-md" onSubmit={event => { event.preventDefault(); setPage(1); setQuery(draft.trim()); setRefresh(value => value + 1); }}>
        <label htmlFor="cep-report-search" className="sr-only">Search email, element, report ID or version</label>
        <Input id="cep-report-search" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Email, element, report ID or version" maxLength={120} className="h-9" />
        <Button type="submit" size="sm" variant="outline" aria-label="Search reports"><Search className="size-4" /></Button>
      </form>
      <label className="space-y-1 text-xs text-muted-foreground"><span className="block">Result</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="">All results</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="space-y-1 text-xs text-muted-foreground"><span className="block">Received</span><select value={days} onChange={event => { setDays(event.target.value); setPage(1); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>
    </div>

    <div aria-live="polite" className="text-sm text-muted-foreground">{busy ? "Loading reports…" : list ? `${list.total.toLocaleString()} reports` : "Reports unavailable"}</div>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-border p-4 text-sm"><p>{error}</p><Button variant="ghost" size="sm" onClick={() => setRefresh(value => value + 1)}>Retry</Button></div> : null}
    <div className="max-w-full overflow-x-auto" aria-busy={busy}>
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="text-xs font-normal text-muted-foreground"><tr><th className="py-3 pr-4 font-normal">Element / user</th><th className="px-4 py-3 font-normal">Premiere / extension</th><th className="px-4 py-3 font-normal">Result</th><th className="px-4 py-3 text-right font-normal">Missing</th><th className="py-3 pl-4 text-right font-normal">Received / duration</th></tr></thead>
        <tbody>{reports.map(report => <tr key={report.reportId} className="border-b border-border/50">
          <td className="py-4 pr-4"><button type="button" onClick={() => void openReport(report.reportId)} className="max-w-full text-left font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{report.itemName}</button><p className="mt-1 break-all text-xs text-muted-foreground">{report.userEmail || "Anonymous client"}</p></td>
          <td className="px-4 py-4 tabular-nums"><p>{report.hostVersion}</p><p className="mt-1 text-xs text-muted-foreground">Gal {report.extensionVersion}</p></td>
          <td className="whitespace-nowrap px-4 py-4"><Status value={report.status} /></td>
          <td className="px-4 py-4 text-right tabular-nums">{report.missingCount}</td>
          <td className="whitespace-nowrap py-4 pl-4 text-right tabular-nums"><time dateTime={report.receivedAt}>{date(report.receivedAt)}</time><p className="mt-1 text-xs text-muted-foreground">{(report.durationMs / 1000).toFixed(1)} s</p></td>
        </tr>)}{!reports.length ? <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">{busy ? "Loading…" : query || status ? "No reports match these filters." : "Reports will appear after elements are applied in Gal Toolkit MAX."}</td></tr> : null}</tbody>
      </table>
    </div>
    {list && list.total > list.pageSize ? <footer className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span className="tabular-nums">{reports.length ? (page - 1) * list.pageSize + 1 : 0}–{(page - 1) * list.pageSize + reports.length} of {list.total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={busy || page * list.pageSize >= list.total} onClick={() => setPage(value => value + 1)}>Next</Button></div></footer> : null}

    <Dialog open={selected !== null} onOpenChange={open => { if (!open) { setSelected(null); detailRequest.current?.abort(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>{detail?.itemName || "Apply report"}</DialogTitle><DialogDescription>{detail ? `${date(detail.occurredAt)} · Premiere ${detail.hostVersion} · Gal ${detail.extensionVersion}` : "Loading report details…"}</DialogDescription></DialogHeader>
        {detailError ? <div role="alert" className="text-sm">{detailError}<Button variant="ghost" size="sm" onClick={() => selected && void openReport(selected)}>Retry</Button></div> : null}
        {detail ? <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><div><Status value={detail.status} /><span className="ml-4 tabular-nums">{detail.missingCount} missing</span></div><Button size="sm" variant="outline" onClick={() => download(detail)}><Download className="mr-2 size-4" aria-hidden />Download JSON</Button></div>
          <dl className="grid gap-4 border-y border-border py-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">{detail.verifiedUserId ? `Verified account #${detail.verifiedUserId}` : "Client-reported account"}</dt><dd className="mt-1 break-all">{detail.userEmail || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Local user</dt><dd className="mt-1">{detail.payload.context.user?.localUser || "—"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Package path</dt><dd className="mt-1 break-all font-mono text-xs">{detail.payload.context.pack?.path || "—"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Report ID</dt><dd className="mt-1 break-all font-mono text-xs">{detail.reportId}</dd></div></dl>
          <div role="tablist" aria-label="Report details" className="flex gap-5 overflow-x-auto border-b border-border">{sections.map(value => <button key={value} type="button" role="tab" id={`cep-tab-${value}`} aria-controls="cep-report-content" aria-selected={section === value} onClick={() => setSection(value)} className={`shrink-0 border-b py-2 text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${section === value ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`}>{value}</button>)}</div>
          <div role="tabpanel" id="cep-report-content" aria-labelledby={`cep-tab-${section}`} className="min-h-40">
            {section === "logs" ? detail.payload.logs.length ? <ol className="divide-y divide-border/40">{detail.payload.logs.map((log, index) => <li key={`${log.sequence}-${index}`} className="py-3"><div className="flex gap-3 text-xs text-muted-foreground"><time dateTime={log.time}>{date(log.time)}</time><span className={log.level === "error" ? "text-red-700 dark:text-red-300" : undefined}>{log.level}</span></div><pre className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{typeof log.data === "string" ? log.data : JSON.stringify(log.data, null, 2)}</pre></li>)}</ol> : <p className="py-6 text-sm text-muted-foreground">No console entries were captured.</p> : <pre className="overflow-x-auto whitespace-pre-wrap break-words py-3 font-mono text-xs leading-relaxed">{JSON.stringify(jsonSection, null, 2) || "—"}</pre>}
          </div>
        </> : null}
      </DialogContent>
    </Dialog>
  </section>;
}
