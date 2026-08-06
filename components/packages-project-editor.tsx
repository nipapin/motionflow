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
  description: string;
  previewUrl: string | null;
  videoPreviewUrl: string | null;
  downloadKey: string | null;
  downloadUrl: string | null;
  files: { main?: string; image?: string; video?: string };
};

function stripScripts(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

function toSafeHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return stripScripts(trimmed);
}

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
  const [description, setDescription] = useState("");
  const [descMode, setDescMode] = useState<"edit" | "preview">("edit");
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
      setDescription(data.project.description || "");
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
          description,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      setProject(data.project);
      setDescription(data.project.description || "");
      setMsg("Saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadAsset = async (kind: "preview" | "video" | "zip", file: File) => {
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
          : kind === "video"
            ? { videoKeyOrUrl: signed.bindValue }
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

  const descriptionPreviewHtml = toSafeHtml(description);

  return (
    <div className="space-y-6 max-w-3xl">
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
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Description (HTML)</span>
            <div className="inline-flex rounded-md border border-border p-0.5">
              <button
                type="button"
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition",
                  descMode === "edit"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setDescMode("edit")}
              >
                Edit HTML
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition",
                  descMode === "preview"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setDescMode("preview")}
              >
                Preview
              </button>
            </div>
          </div>
          {descMode === "edit" ? (
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-40 font-mono"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              spellCheck={false}
              placeholder="<p>Product description…</p>"
            />
          ) : descriptionPreviewHtml ? (
            <div
              className="min-h-40 rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed
                [&>*+*]:mt-3
                [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold
                [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold
                [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold
                [&_a]:text-blue-400 [&_a]:underline
                [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5
                [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5
                [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg"
              dangerouslySetInnerHTML={{ __html: descriptionPreviewHtml }}
            />
          ) : (
            <div className="min-h-40 rounded-lg border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
              Nothing to preview yet.
            </div>
          )}
        </div>
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
            <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium">
              Upload preview
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4 space-y-3">
          <h3 className="font-semibold text-sm">Video preview</h3>
          {project.videoPreviewUrl ? (
            <video
              src={project.videoPreviewUrl}
              className="w-full max-h-40 rounded-lg bg-muted/30"
              controls
              muted
            />
          ) : (
            <p className="text-xs text-muted-foreground">No video</p>
          )}
          <label className="inline-flex">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAsset("video", f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium">
              Upload video
            </span>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-card/40 p-4 space-y-3">
        <h3 className="font-semibold text-sm">Download archive (R2)</h3>
        <p className="text-xs text-muted-foreground break-all">
          {project.downloadKey || "Not linked"}
        </p>
        {project.downloadUrl ? (
          <a
            href={project.downloadUrl}
            className="text-xs text-blue-400 hover:underline break-all"
            target="_blank"
            rel="noreferrer"
          >
            {project.downloadUrl}
          </a>
        ) : null}
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
            <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium">
              Upload zip
            </span>
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setShowPicker((v) => !v)}
          >
            {showPicker ? "Hide R2 picker" : "Select existing R2 file"}
          </Button>
        </div>
        {showPicker ? (
          <div className="pt-2 border-t border-border/40">
            <PackagesR2Browser
              objects={r2Objects}
              onSelectFile={(obj) => void bindR2(obj)}
              selectLabel="Use as download"
            />
          </div>
        ) : null}
      </div>

      {msg ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {msg}
        </p>
      ) : null}
    </div>
  );
}
