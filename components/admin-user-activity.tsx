"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Download, Loader2, Monitor, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  activityActionLabels, activityStatusLabels, activityToolLabels,
  type ActivityCategory, type UserActivityEntry, type UserActivityPage,
} from "@/lib/user-activity-shared";

const sourceLabels = { web: "Website", extension: "Extension", unknown: "Source not recorded" };
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
});
function when(value: string): string {
  const date = new Date(value.slice(0, 23) + "Z");
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : value;
}
function resource(entry: UserActivityEntry): string {
  if (entry.resourceType === "tool") return activityToolLabels[entry.resourceId ?? ""] ?? entry.resourceId ?? "AI tool";
  return entry.resourceName || (entry.resourceId ? `${entry.resourceType === "extension_pack" ? "Pack" : "Material"} #${entry.resourceId}` : "Unknown material");
}
function context(entry: UserActivityEntry): string {
  const { details } = entry;
  return [sourceLabels[entry.source], entry.deviceId ? `Device #${entry.deviceId}` : null,
    details.client, details.host, details.brand, details.fileKind,
    details.previousVersion ? `v${details.previousVersion} → ${details.version ? `v${details.version}` : "version not reported"}`
      : details.version ? `v${details.version}` : null,
    details.httpStatus && entry.status === "failed" ? `HTTP ${details.httpStatus}` : null,
  ].filter(Boolean).join(" · ");
}

export function AdminUserActivity({ userId }: { userId: number }) {
  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [entries, setEntries] = useState<UserActivityEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async (nextCursor?: string) => {
    requestRef.current?.abort();
    const ac = new AbortController();
    requestRef.current = ac;
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (category !== "all") query.set("category", category);
      if (nextCursor) query.set("cursor", nextCursor);
      const response = await fetch(`/api/admin/users/${userId}/activity?${query}`, { signal: ac.signal, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403
        ? "You no longer have permission to view user activity."
        : "Could not load activity. Try refreshing.");
      const page = await response.json() as UserActivityPage;
      if (ac.signal.aborted) return;
      setEntries((previous) => nextCursor ? [...previous, ...page.entries] : page.entries);
      setCursor(page.nextCursor);
      setPartial(page.unavailableSources.length > 0);
    } catch (err) {
      if (!ac.signal.aborted) setError(err instanceof Error ? err.message : "Could not load activity. Try refreshing.");
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  }, [category, userId]);

  useEffect(() => {
    setEntries([]);
    setCursor(null);
    setPartial(false);
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  return (
    <section aria-label="User activity" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Activity type
          <select value={category} onChange={(event) => setCategory(event.target.value as ActivityCategory | "all")}
            className="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">All activity</option>
            <option value="download">Downloads</option>
            <option value="generation">AI tools</option>
            <option value="extension">Extension activity</option>
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Newest first · Database time. A file or link issued does not confirm that the download finished.
        Extension events reflect reported pack state, not effects applied in a project.
      </p>
      {partial ? <p role="status" className="text-sm text-muted-foreground">Some older history sources are unavailable on this installation.</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {busy && entries.length === 0 ? (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading activity…</p>
      ) : !error && entries.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <p className="text-sm font-medium">No activity recorded{category === "all" ? " yet" : " for this type"}.</p>
          <p className="text-sm text-muted-foreground">Existing download and AI history appears here when available. Other actions are recorded from the tracking update onward.</p>
        </div>
      ) : null}
      <ol className="divide-y divide-border/60" aria-busy={busy}>
        {entries.map((entry) => {
          const Icon = entry.category === "download" ? Download : entry.category === "generation" ? Sparkles : Monitor;
          return (
            <li key={entry.id} className="flex gap-3 py-4 first:pt-0">
              <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <p className="text-sm font-medium">{activityActionLabels[entry.action] ?? entry.action}</p>
                  <Badge variant={entry.status === "failed" ? "outline" : "secondary"}
                    className={entry.status === "failed" ? "border-destructive/50 bg-destructive/10" : undefined}>
                    {activityStatusLabels[entry.status]}
                  </Badge>
                </div>
                <p className="break-words text-sm">{resource(entry)}</p>
                <p className="break-words text-xs leading-relaxed text-muted-foreground">{context(entry)}</p>
                <time dateTime={entry.createdAt} className="block text-xs tabular-nums text-muted-foreground">{when(entry.createdAt)}</time>
              </div>
            </li>
          );
        })}
      </ol>
      {cursor ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void load(cursor)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Activity className="h-4 w-4" aria-hidden="true" />}
          {busy ? "Loading…" : "Load older activity"}
        </Button>
      ) : null}
    </section>
  );
}
