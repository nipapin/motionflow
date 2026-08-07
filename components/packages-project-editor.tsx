"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { PackagesR2Browser, type R2BrowserObject } from "@/components/packages-r2-browser";
import { Button } from "@/components/ui/button";
import { getPackagesAuthorPublicById } from "@/lib/packages-admin-client";
import { cn } from "@/lib/utils";

type Project = {
  id: number;
  author_id: number;
  name: string;
  version: string | null;
  host: "PR" | "AE";
  min_extension_version: string | null;
  min_host_version: string | null;
  details_url: string | null;
  previewUrl: string | null;
  downloadKey: string | null;
  downloadUrl: string | null;
  price: number;
  visible: boolean;
};

export function PackagesProjectEditor({
  authorId,
  itemId,
}: {
  authorId: number;
  itemId: number;
}) {
  const author = getPackagesAuthorPublicById(authorId);
  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [host, setHost] = useState<"PR" | "AE">("AE");
  const [minExt, setMinExt] = useState("");
  const [minHost, setMinHost] = useState("");
  const [detailsUrl, setDetailsUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [r2Objects, setR2Objects] = useState<R2BrowserObject[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/packages/${authorId}/projects/${itemId}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      setProject(data.project);
      setName(data.project.name);
      setVersion(data.project.version || "");
      setHost(data.project.host === "PR" ? "PR" : "AE");
      setMinExt(data.project.min_extension_version || "");
      setMinHost(data.project.min_host_version || "");
      setDetailsUrl(data.project.details_url || "");
      setVisible(Boolean(data.project.visible));
      setPreviewBroken(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [authorId, itemId]);

  const loadR2 = useCallback(async () => {
    try {
      const res = await fetch(`/api/packages/${authorId}/r2`);
      if (!res.ok) return;
      const data = (await res.json()) as { objects: R2BrowserObject[] };
      setR2Objects(data.objects || []);
    } catch {
      /* ignore */
    }
  }, [authorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showPicker) void loadR2();
  }, [showPicker, loadR2]);

  const saveMeta = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/packages/${authorId}/projects/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          version: version || null,
          host,
          min_extension_version: minExt || null,
          min_host_version: minHost || null,
          details_url: detailsUrl || null,
          visible,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      setProject(data.project);
      setMsg("Saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadAsset = async (kind: "preview" | "zip", file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const pre = await fetch(
        `/api/packages/${authorId}/projects/${itemId}/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            filename: file.name,
            contentType: file.type || undefined,
          }),
        },
      );
      if (!pre.ok) throw new Error(await pre.text());
      const signed = (await pre.json()) as {
        putUrl: string;
        bindValue: string;
        key: string;
      };
      const put = await fetch(signed.putUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed ${put.status}`);

      const patchBody =
        kind === "preview"
          ? { previewKeyOrUrl: signed.bindValue }
          : { downloadKey: signed.bindValue };

      const patch = await fetch(`/api/packages/${authorId}/projects/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!patch.ok) throw new Error(await patch.text());
      const data = (await patch.json()) as { project: Project };
      setProject(data.project);
      if (kind === "preview") setPreviewBroken(false);
      setMsg(`${kind} uploaded`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const bindR2 = async (obj: R2BrowserObject) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/packages/${authorId}/projects/${itemId}/bind-r2`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: obj.key }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      setProject(data.project);
      setShowPicker(false);
      setMsg(`Bound ${obj.key}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Bind failed");
    } finally {
      setBusy(false);
    }
  };

  if (!author) {
    return <p className="text-sm text-destructive">Unknown author.</p>;
  }

  if (error) {
    return (
      <div className="space-y-3">
        <Link
          href={`/profile/packages/${authorId}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!project) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <Link
          href={`/profile/packages/${authorId}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {author.label} projects
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          #{project.id} · {author.label}
        </p>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4 space-y-3">
        <label className="block text-xs text-muted-foreground">
          Name
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Version
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="1.0.0"
          />
        </label>
        <div>
          <span className="text-xs text-muted-foreground">Application</span>
          <div className="mt-1 inline-flex rounded-md border border-border p-0.5">
            {(
              [
                { id: "PR" as const, label: "Premiere" },
                { id: "AE" as const, label: "After Effects" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition",
                  host === opt.id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setHost(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-muted-foreground">
          Min extension version
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={minExt}
            onChange={(e) => setMinExt(e.target.value)}
            placeholder="1.0.0"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Min host application version
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={minHost}
            onChange={(e) => setMinHost(e.target.value)}
            placeholder="24.0"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Details (resource URL)
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={detailsUrl}
            onChange={(e) => setDetailsUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          Visible in CEP extension
        </label>
        <Button type="button" size="sm" disabled={busy} onClick={() => void saveMeta()}>
          <Save className="h-3.5 w-3.5 mr-1" />
          Save metadata
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4 space-y-3">
          <h3 className="font-semibold text-sm">Preview image</h3>
          {project.previewUrl && !previewBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.previewUrl}
              alt=""
              className="w-full max-h-40 object-contain rounded-lg bg-muted/30"
              onError={() => setPreviewBroken(true)}
            />
          ) : (
            <div className="space-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={author.logoUrl}
                alt={`${author.label} logo`}
                className="w-full max-h-40 object-contain rounded-lg bg-muted/30 p-4"
              />
              <p className="text-xs text-muted-foreground">
                {project.previewUrl
                  ? "Preview failed to load — showing author logo"
                  : "No preview — showing author logo"}
              </p>
            </div>
          )}
          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAsset("preview", f);
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="outline" disabled={busy} asChild>
              <span>Upload preview</span>
            </Button>
          </label>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4 space-y-3">
          <h3 className="font-semibold text-sm">Download zip</h3>
          <p className="text-xs text-muted-foreground break-all">
            {project.downloadKey || "No zip linked"}
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex">
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAsset("zip", f);
                  e.target.value = "";
                }}
              />
              <Button type="button" size="sm" variant="outline" disabled={busy} asChild>
                <span>Upload zip</span>
              </Button>
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setShowPicker((v) => !v)}
            >
              {showPicker ? "Hide R2 picker" : "Bind from R2"}
            </Button>
          </div>
          {showPicker ? (
            <PackagesR2Browser objects={r2Objects} onSelectFile={(o) => void bindR2(o)} />
          ) : null}
        </div>
      </div>

      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
