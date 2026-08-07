"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPackagesAuthorPublicById } from "@/lib/packages-admin-client";
import { cn } from "@/lib/utils";

type Project = {
  id: number;
  author_id: number;
  name: string;
  version: string | null;
  host: "PR" | "AE";
  previewUrl: string | null;
  downloadKey: string | null;
  visible: boolean;
  updated_at: string;
};

function formatUpdated(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ProjectThumb({
  previewUrl,
  logoUrl,
  label,
}: {
  previewUrl: string | null;
  logoUrl: string;
  label: string;
}) {
  const [src, setSrc] = useState(previewUrl || logoUrl);

  useEffect(() => {
    setSrc(previewUrl || logoUrl);
  }, [previewUrl, logoUrl]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={cn(
        "h-10 w-10 shrink-0 rounded-md bg-muted/50",
        src === logoUrl ? "object-contain p-1.5" : "object-cover",
      )}
      onError={() => {
        if (src !== logoUrl) setSrc(logoUrl);
      }}
      title={src === logoUrl ? `${label} logo` : undefined}
    />
  );
}

export function PackagesProjectList({ authorId }: { authorId: number }) {
  const author = getPackagesAuthorPublicById(authorId);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [displayLabel, setDisplayLabel] = useState(author?.label ?? "");
  const [r2Bucket, setR2Bucket] = useState("");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [bucketsError, setBucketsError] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [settingsOk, setSettingsOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${authorId}/projects`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { projects: Project[] };
      setProjects(data.projects || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [authorId]);

  const loadAuthorSettings = useCallback(async () => {
    setBucketsError(null);
    try {
      const [authorRes, bucketsRes] = await Promise.all([
        fetch(`/api/packages/authors/${authorId}`),
        fetch("/api/packages/buckets"),
      ]);
      if (authorRes.ok) {
        const data = (await authorRes.json()) as {
          author: { label: string; r2_bucket: string | null };
        };
        setDisplayLabel(data.author.label);
        setR2Bucket(data.author.r2_bucket || "");
      }
      if (bucketsRes.ok) {
        const data = (await bucketsRes.json()) as { buckets: string[] };
        setBuckets(data.buckets || []);
      } else {
        setBuckets([]);
        setBucketsError("Could not load R2 buckets");
      }
    } catch {
      setBucketsError("Could not load author settings");
    }
  }, [authorId]);

  useEffect(() => {
    void load();
    void loadAuthorSettings();
  }, [load, loadAuthorSettings]);

  const bucketOptions = (() => {
    const set = new Set(buckets);
    if (r2Bucket) set.add(r2Bucket);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

  const saveAuthorSettings = async () => {
    setSettingsBusy(true);
    setSettingsMsg(null);
    try {
      const res = await fetch(`/api/packages/authors/${authorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: displayLabel,
          r2_bucket: r2Bucket.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        throw new Error(body.message || body.error || `Save failed (${res.status})`);
      }
      const data = (await res.json()) as {
        author: { label: string; r2_bucket: string | null };
      };
      setDisplayLabel(data.author.label);
      setR2Bucket(data.author.r2_bucket || "");
      setSettingsMsg("Saved");
      setSettingsOk(true);
    } catch (e) {
      setSettingsMsg(e instanceof Error ? e.message : "Save failed");
      setSettingsOk(false);
    } finally {
      setSettingsBusy(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) =>
        `${p.name} ${p.version ?? ""} ${p.id} ${p.host}`.toLowerCase().includes(q),
      )
    : projects;

  const createProject = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/packages/${authorId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New project" }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      window.location.href = `/profile/packages/${authorId}/${data.project.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  };

  const toggleVisible = async (project: Project, visible: boolean) => {
    setTogglingId(project.id);
    setError(null);
    const prev = project.visible;
    setProjects((list) =>
      list.map((p) => (p.id === project.id ? { ...p, visible } : p)),
    );
    try {
      const res = await fetch(
        `/api/packages/${authorId}/projects/${project.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visible }),
        },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: Project };
      setProjects((list) =>
        list.map((p) => (p.id === data.project.id ? { ...p, ...data.project } : p)),
      );
    } catch (e) {
      setProjects((list) =>
        list.map((p) => (p.id === project.id ? { ...p, visible: prev } : p)),
      );
      setError(e instanceof Error ? e.message : "Could not update visibility");
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/packages/${authorId}/projects/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(await res.text());
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (!author) {
    return <p className="text-sm text-destructive">Unknown author.</p>;
  }

  const showSkeleton = loading && projects.length === 0;

  return (
    <div className="w-full space-y-8">
      <header className="space-y-5">
        <nav className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Link
            href="/profile/packages"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Packages
          </Link>
          <span className="text-muted-foreground/40" aria-hidden>
            /
          </span>
          <span className="text-foreground/80">{displayLabel || author.label}</span>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={author.logoUrl}
              alt=""
              className="mt-0.5 h-11 w-11 rounded-lg bg-muted/60 object-contain p-1.5"
            />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {displayLabel || author.label}
              </h1>
              <p className="mt-1 text-[15px] text-muted-foreground">
                CEP packages for this author
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => void createProject()}
            disabled={creating}
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            New package
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border/50 px-4 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Author settings</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Display name and R2 bucket used for zip archives.
            </p>
          </div>
          {settingsMsg ? (
            <p
              className={cn(
                "text-[13px]",
                settingsOk
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
              role="status"
            >
              {settingsOk ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {settingsMsg}
                </span>
              ) : (
                settingsMsg
              )}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="author-display-name">Display name</Label>
            <Input
              id="author-display-name"
              value={displayLabel}
              onChange={(e) => setDisplayLabel(e.target.value)}
            />
          </div>
          <div className="min-w-0 flex-[1.4] space-y-2">
            <Label htmlFor="author-r2-bucket">R2 bucket</Label>
            <select
              id="author-r2-bucket"
              className={cn(
                "border-input h-9 w-full rounded-md border bg-transparent px-3 font-mono text-sm outline-none",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              value={r2Bucket}
              onChange={(e) => setR2Bucket(e.target.value)}
              disabled={settingsBusy || (bucketOptions.length === 0 && !r2Bucket)}
            >
              <option value="">— Not set —</option>
              {bucketOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            {bucketsError ? (
              <p className="text-[12px] text-destructive">{bucketsError}</p>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            disabled={settingsBusy}
            onClick={() => void saveAuthorSettings()}
          >
            {settingsBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, version, host…"
            className="h-9 pl-9"
            aria-label="Search packages"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-muted-foreground"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
        {!loading && projects.length > 0 ? (
          <span className="ml-auto text-[13px] text-muted-foreground">
            {filtered.length === projects.length
              ? `${projects.length} package${projects.length === 1 ? "" : "s"}`
              : `${filtered.length} of ${projects.length}`}
          </span>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/50">
        {showSkeleton ? (
          <div className="space-y-0 divide-y divide-border/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="hidden h-3 w-20 sm:block" />
                <Skeleton className="hidden h-5 w-12 sm:block" />
              </div>
            ))}
          </div>
        ) : error && projects.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">Could not load packages.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {projects.length === 0 ? "No packages yet" : "No matches"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {projects.length === 0
                ? "Create a package to attach a preview, version, and R2 download zip."
                : "Try a different search term."}
            </p>
            {projects.length === 0 ? (
              <Button
                type="button"
                size="sm"
                className="mt-5 gap-1.5"
                onClick={() => void createProject()}
                disabled={creating}
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Create package
              </Button>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="h-10 pl-4 text-[12px] font-medium text-muted-foreground">
                  Package
                </TableHead>
                <TableHead className="h-10 text-[12px] font-medium text-muted-foreground">
                  Host
                </TableHead>
                <TableHead className="h-10 text-[12px] font-medium text-muted-foreground">
                  Version
                </TableHead>
                <TableHead className="h-10 text-[12px] font-medium text-muted-foreground">
                  Download
                </TableHead>
                <TableHead className="h-10 text-[12px] font-medium text-muted-foreground">
                  In CEP
                </TableHead>
                <TableHead className="h-10 text-[12px] font-medium text-muted-foreground">
                  Updated
                </TableHead>
                <TableHead className="h-10 pr-4 text-right text-[12px] font-medium text-muted-foreground">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className="border-border/40 transition-colors hover:bg-foreground/2.5"
                >
                  <TableCell className="pl-4 whitespace-normal">
                    <Link
                      href={`/profile/packages/${authorId}/${p.id}`}
                      className="group flex min-w-0 items-center gap-3"
                    >
                      <ProjectThumb
                        previewUrl={p.previewUrl}
                        logoUrl={author.logoUrl}
                        label={author.label}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium transition-colors group-hover:text-foreground">
                          {p.name}
                        </p>
                        <span className="text-[12px] text-muted-foreground">#{p.id}</span>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {p.host === "PR" ? "Premiere" : "After Effects"}
                  </TableCell>
                  <TableCell className="font-mono text-[13px] text-muted-foreground">
                    {p.version ? `v${p.version}` : "—"}
                  </TableCell>
                  <TableCell>
                    {p.downloadKey ? (
                      <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
                        Linked
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <Switch
                        checked={p.visible}
                        disabled={togglingId === p.id}
                        onCheckedChange={(checked) => void toggleVisible(p, checked)}
                        aria-label={`Show ${p.name} in CEP`}
                      />
                      <span
                        className={cn(
                          "w-6 text-[12px]",
                          p.visible ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {togglingId === p.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : p.visible ? (
                          "On"
                        ) : (
                          "Off"
                        )}
                      </span>
                    </label>
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {formatUpdated(p.updated_at)}
                  </TableCell>
                  <TableCell className="pr-3 text-right">
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        asChild
                      >
                        <Link
                          href={`/profile/packages/${authorId}/${p.id}`}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Hide package from list?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `“${deleteTarget.name}” (#${deleteTarget.id}) will be soft-deleted — kept in the database, removed from this list and CEP.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1" />
              )}
              Soft-delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
