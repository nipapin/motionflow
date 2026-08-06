"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Package, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Author = {
  id: number;
  slug: string;
  label: string;
  r2Prefixes: string[];
};

type DemoManifest = {
  version: string;
  host: string;
  downloadUrl: string;
  updatedAt: string;
  name?: string;
  description?: string;
};

type DemoBlock = {
  host: string;
  manifest: DemoManifest | null;
  versions: { version: string; downloadUrl: string; key: string }[];
};

type R2Object = {
  key: string;
  size: number;
  lastModified: string | null;
  publicUrl: string;
};

type SyncEvent = {
  id: number;
  author_id: number;
  object_key: string;
  action: string;
  created_at: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function DemoCard({
  demo,
  onSaved,
}: {
  demo: DemoBlock;
  onSaved: () => void;
}) {
  const [name, setName] = useState(demo.manifest?.name || "");
  const [description, setDescription] = useState(demo.manifest?.description || "");
  const [version, setVersion] = useState(demo.manifest?.version || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(demo.manifest?.name || "");
    setDescription(demo.manifest?.description || "");
    setVersion(demo.manifest?.version || "");
  }, [demo]);

  const saveMeta = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/studio/packages/demo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: demo.host,
          version: version || demo.manifest?.version,
          name,
          description,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("Saved");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadZip = async (file: File) => {
    const v = (version || demo.manifest?.version || "").trim();
    if (!v) {
      setMsg("Set a version before upload");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const pre = await fetch("/api/studio/packages/demo/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: demo.host, version: v }),
      });
      if (!pre.ok) throw new Error(await pre.text());
      const { putUrl } = (await pre.json()) as { putUrl: string };
      const put = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed ${put.status}`);
      const pub = await fetch("/api/studio/packages/demo/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: demo.host, version: v, name, description }),
      });
      if (!pub.ok) throw new Error(await pub.text());
      setMsg("Uploaded & published");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Demo {demo.host}</h3>
        {demo.manifest?.downloadUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => copyText(demo.manifest!.downloadUrl)}
          >
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copy link
          </Button>
        ) : null}
      </div>
      <label className="block text-xs text-muted-foreground">
        Version
        <input
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          placeholder="2026.08.06"
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Name
        <input
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-xs text-muted-foreground">
        Description
        <textarea
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-16"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={saveMeta}>
          Save metadata
        </Button>
        <label className="inline-flex">
          <input
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadZip(f);
              e.target.value = "";
            }}
          />
          <span
            className={cn(
              "inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium",
              busy && "opacity-50 pointer-events-none",
            )}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            Upload zip
          </span>
        </label>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      {demo.versions.length > 0 ? (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-1">Versions on R2</p>
          <ul className="space-y-1 max-h-32 overflow-auto text-xs">
            {demo.versions.map((v) => (
              <li key={v.key} className="flex items-center justify-between gap-2">
                <span>{v.version}</span>
                <button
                  type="button"
                  className="text-blue-400 hover:underline"
                  onClick={() => copyText(v.downloadUrl)}
                >
                  copy
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function PackagesStudio() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [active, setActive] = useState<string>("premiere-gal");
  const [demos, setDemos] = useState<DemoBlock[]>([]);
  const [spunkramVersions, setSpunkramVersions] = useState<
    { version: string; zxpUrl: string; channel: string }[]
  >([]);
  const [objects, setObjects] = useState<R2Object[]>([]);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAuthors = useCallback(async () => {
    const res = await fetch("/api/studio/packages/authors");
    if (!res.ok) throw new Error("Forbidden or failed to load authors");
    const data = (await res.json()) as { authors: Author[] };
    setAuthors(data.authors);
    if (data.authors[0] && !data.authors.some((a) => a.slug === active)) {
      setActive(data.authors[0].slug);
    }
  }, [active]);

  const loadAuthor = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/studio/packages?author=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDemos(data.demos || []);
      setSpunkramVersions(data.spunkramVersions || []);
      setObjects(data.objects || []);
      setEvents(data.events || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAuthors().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [loadAuthors]);

  useEffect(() => {
    if (active) void loadAuthor(active);
  }, [active, loadAuthor]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-400" />
            Packages
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Superadmin R2 packs by author (Demo + file listing).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadAuthor(active)}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {authors.map((a) => (
          <button
            key={a.slug}
            type="button"
            onClick={() => setActive(a.slug)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium border transition",
              active === a.slug
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-card/40 text-muted-foreground border-border hover:text-foreground",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {active === "premiere-gal" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {demos.map((d) => (
            <DemoCard key={d.host} demo={d} onSaved={() => void loadAuthor(active)} />
          ))}
        </div>
      ) : null}

      {active === "spunkram" ? (
        <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4">
          <h3 className="font-semibold mb-2">Spunkram ZXP versions</h3>
          {spunkramVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No versions found on R2.</p>
          ) : (
            <ul className="space-y-1 text-sm max-h-48 overflow-auto">
              {spunkramVersions.map((v) => (
                <li key={v.version} className="flex justify-between gap-2">
                  <span>
                    {v.version}{" "}
                    <span className="text-muted-foreground text-xs">({v.channel})</span>
                  </span>
                  <button
                    type="button"
                    className="text-blue-400 hover:underline text-xs"
                    onClick={() => copyText(v.zxpUrl)}
                  >
                    copy
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4">
        <h3 className="font-semibold mb-2">R2 files</h3>
        {objects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No objects under author prefixes.</p>
        ) : (
          <div className="overflow-auto max-h-80">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/50">
                  <th className="py-2 pr-2">Key</th>
                  <th className="py-2 pr-2">Size</th>
                  <th className="py-2 pr-2">Modified</th>
                  <th className="py-2">Link</th>
                </tr>
              </thead>
              <tbody>
                {objects.map((o) => (
                  <tr key={o.key} className="border-b border-border/30">
                    <td className="py-1.5 pr-2 font-mono break-all">{o.key}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatBytes(o.size)}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {o.lastModified ? new Date(o.lastModified).toLocaleString() : "—"}
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        className="text-blue-400 hover:underline"
                        onClick={() => copyText(o.publicUrl)}
                      >
                        copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4">
        <h3 className="font-semibold mb-2">Recent R2Sync events</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        ) : (
          <ul className="space-y-1 text-xs max-h-40 overflow-auto font-mono">
            {events.map((e) => (
              <li key={e.id}>
                [{e.created_at}] {e.action} — {e.object_key}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
