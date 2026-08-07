"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Save } from "lucide-react";
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

function StepBadge({ n, done, current }: { n: number; done: boolean; current: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold shrink-0",
        done
          ? "bg-emerald-500/20 text-emerald-400"
          : current
            ? "bg-blue-500/20 text-blue-300"
            : "bg-muted text-muted-foreground",
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : n}
    </span>
  );
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
  const [authorBucket, setAuthorBucket] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [host, setHost] = useState<"PR" | "AE">("AE");
  const [minExt, setMinExt] = useState("");
  const [minHost, setMinHost] = useState("");
  const [detailsUrl, setDetailsUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [r2Objects, setR2Objects] = useState<R2BrowserObject[]>([]);
  const [r2Folders, setR2Folders] = useState<{ name: string; prefix: string }[]>([]);
  const [r2Prefix, setR2Prefix] = useState("");
  const [r2Error, setR2Error] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [projRes, authorRes] = await Promise.all([
        fetch(`/api/packages/${authorId}/projects/${itemId}`),
        fetch(`/api/packages/authors/${authorId}`),
      ]);
      if (!projRes.ok) throw new Error(await projRes.text());
      const data = (await projRes.json()) as { project: Project };
      setProject(data.project);
      setName(data.project.name);
      setVersion(data.project.version || "");
      setHost(data.project.host === "PR" ? "PR" : "AE");
      setMinExt(data.project.min_extension_version || "");
      setMinHost(data.project.min_host_version || "");
      setDetailsUrl(data.project.details_url || "");
      setVisible(Boolean(data.project.visible));
      setPreviewBroken(false);

      if (authorRes.ok) {
        const a = (await authorRes.json()) as { author: { r2_bucket: string | null } };
        setAuthorBucket(a.author.r2_bucket);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [authorId, itemId]);

  const loadR2 = useCallback(async (nextPrefix = "") => {
    setR2Error(null);
    try {
      const qs = nextPrefix
        ? `?prefix=${encodeURIComponent(nextPrefix)}`
        : "";
      const res = await fetch(`/api/packages/${authorId}/r2${qs}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        setR2Error(body.message || body.error || "Could not list bucket");
        setR2Objects([]);
        setR2Folders([]);
        return;
      }
      const data = (await res.json()) as {
        objects: R2BrowserObject[];
        folders?: { name: string; prefix: string }[];
        prefix?: string;
        bucket?: string | null;
      };
      setR2Objects(data.objects || []);
      setR2Folders(data.folders || []);
      setR2Prefix(data.prefix || nextPrefix || "");
      if (data.bucket) setAuthorBucket(data.bucket);
    } catch {
      setR2Error("Could not list bucket");
    }
  }, [authorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (authorBucket) void loadR2("");
  }, [authorBucket, loadR2]);

  const saveMeta = async (extra?: { visible?: boolean }) => {
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
          visible: extra?.visible ?? visible,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      setProject(data.project);
      if (extra?.visible !== undefined) setVisible(extra.visible);
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
      setMsg(kind === "preview" ? "Preview uploaded" : "Zip uploaded");
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
      setMsg(`Linked ${obj.key}`);
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

  const step1Done = Boolean(name.trim() && version.trim());
  const step2Done = Boolean(project.previewUrl);
  const step3Done = Boolean(project.downloadKey);

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
          {authorBucket ? ` · bucket ${authorBucket}` : " · no bucket set"}
        </p>
      </div>

      {/* Step 1 — Basics */}
      <section className="rounded-xl border border-blue-500/20 bg-card/40 p-5 space-y-4">
        <header className="flex items-center gap-2.5">
          <StepBadge n={1} done={step1Done} current />
          <div>
            <h2 className="text-sm font-semibold">Basics</h2>
            <p className="text-xs text-muted-foreground">Name, host app, versions, details link</p>
          </div>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-muted-foreground sm:col-span-2">
            Name
            <input
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Version
            <input
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </label>
          <div>
            <span className="text-xs text-muted-foreground">Application</span>
            <div className="mt-1.5 inline-flex rounded-md border border-border p-0.5">
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
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={minExt}
              onChange={(e) => setMinExt(e.target.value)}
              placeholder="1.0.0"
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Min host application version
            <input
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={minHost}
              onChange={(e) => setMinHost(e.target.value)}
              placeholder="24.0"
            />
          </label>
          <label className="block text-xs text-muted-foreground sm:col-span-2">
            Details (resource URL)
            <input
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={detailsUrl}
              onChange={(e) => setDetailsUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>
        <Button type="button" size="sm" disabled={busy} onClick={() => void saveMeta()}>
          <Save className="h-3.5 w-3.5 mr-1" />
          Save basics
        </Button>
      </section>

      {/* Step 2 — Preview */}
      <section className="rounded-xl border border-blue-500/20 bg-card/40 p-5 space-y-4">
        <header className="flex items-center gap-2.5">
          <StepBadge n={2} done={step2Done} current={step1Done && !step2Done} />
          <div>
            <h2 className="text-sm font-semibold">Preview image</h2>
            <p className="text-xs text-muted-foreground">Shown in the CEP pack list</p>
          </div>
        </header>
        <div className="flex flex-wrap items-start gap-4">
          {project.previewUrl && !previewBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.previewUrl}
              alt=""
              className="h-32 w-32 rounded-lg object-contain bg-muted/30"
              onError={() => setPreviewBroken(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.logoUrl}
              alt=""
              className="h-32 w-32 rounded-lg object-contain bg-muted/30 p-3"
            />
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
      </section>

      {/* Step 3 — Zip from bucket */}
      <section className="rounded-xl border border-blue-500/20 bg-card/40 p-5 space-y-4">
        <header className="flex items-center gap-2.5">
          <StepBadge n={3} done={step3Done} current={step1Done && step2Done && !step3Done} />
          <div>
            <h2 className="text-sm font-semibold">Download archive</h2>
            <p className="text-xs text-muted-foreground">
              Pick a zip from the author bucket
              {authorBucket ? ` (${authorBucket})` : ""}
            </p>
          </div>
        </header>

        <p className="text-xs break-all text-muted-foreground">
          {project.downloadKey ? (
            <>
              Linked: <span className="text-foreground font-mono">{project.downloadKey}</span>
            </>
          ) : (
            "No zip linked yet"
          )}
        </p>

        {!authorBucket ? (
          <p className="text-sm text-amber-400/90">
            Set an R2 bucket in{" "}
            <Link href="/profile/packages/authors" className="underline hover:text-amber-300">
              Authors settings
            </Link>{" "}
            to browse files.
          </p>
        ) : r2Error ? (
          <p className="text-sm text-destructive">{r2Error}</p>
        ) : (
          <PackagesR2Browser
            objects={r2Objects}
            folders={r2Folders}
            prefix={r2Prefix}
            onNavigate={(p) => void loadR2(p)}
            onSelectFile={(o) => void bindR2(o)}
            selectLabel="Use as pack zip"
          />
        )}

        <div className="flex flex-wrap gap-2 pt-1">
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
              <span>Or upload zip</span>
            </Button>
          </label>
          {authorBucket ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void loadR2(r2Prefix)}
            >
              Refresh bucket
            </Button>
          ) : null}
        </div>
      </section>

      {/* Step 4 — Publish */}
      <section className="rounded-xl border border-blue-500/20 bg-card/40 p-5 space-y-4">
        <header className="flex items-center gap-2.5">
          <StepBadge
            n={4}
            done={visible}
            current={step1Done && step2Done && step3Done && !visible}
          />
          <div>
            <h2 className="text-sm font-semibold">Visibility</h2>
            <p className="text-xs text-muted-foreground">Show this pack in the CEP extension</p>
          </div>
        </header>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-border"
            checked={visible}
            onChange={(e) => setVisible(e.target.checked)}
          />
          Visible in CEP extension
        </label>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void saveMeta({ visible })}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Save visibility
        </Button>
      </section>

      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
