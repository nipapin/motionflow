"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Film,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  previewUrl: string | null;
  videoPreviewUrl: string | null;
  downloadKey: string | null;
  access: number;
  updated_at: string;
};

function accessBadge(access: number): {
  label: string;
  className: string;
} {
  if (access === 1) {
    return {
      label: "Active",
      className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    };
  }
  if (access === -10) {
    return {
      label: "Processing",
      className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    };
  }
  if (access === 0) {
    return {
      label: "Pending",
      className: "bg-muted text-muted-foreground border-border",
    };
  }
  if (access === -1) {
    return {
      label: "Blocked",
      className: "bg-destructive/15 text-destructive border-destructive/30",
    };
  }
  return {
    label: `Status ${access}`,
    className: "bg-muted text-muted-foreground border-border",
  };
}

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
        "h-11 w-11 rounded-lg shrink-0 bg-muted/50",
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

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) =>
        `${p.name} ${p.version ?? ""} ${p.id}`.toLowerCase().includes(q),
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

  if (!author) {
    return <p className="text-sm text-destructive">Unknown author.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/profile/packages" className="hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" />
              Packages
            </Link>
            <span aria-hidden>·</span>
            <span className="text-foreground/80">{author.label}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={author.logoUrl}
              alt=""
              className="h-8 w-8 rounded-md object-contain bg-muted/40 p-1"
            />
            {author.label}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage package instances · author_id {author.id}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => void createProject()}
          disabled={creating}
        >
          {creating ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5 mr-1" />
          )}
          Create package
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-55 flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search packages…"
            className="h-9 pl-8"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-border/80 bg-card/40 overflow-hidden">
        {loading && projects.length === 0 ? (
          <p className="px-4 py-10 text-sm text-muted-foreground text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-sm text-muted-foreground text-center">
            {projects.length === 0
              ? "No packages yet. Create one to attach preview, version, and an R2 download."
              : "No packages match your search."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/60">
                <TableHead className="pl-4">Package</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Download</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const status = accessBadge(p.access ?? 0);
                return (
                  <TableRow key={p.id} className="border-border/50">
                    <TableCell className="pl-4 whitespace-normal">
                      <Link
                        href={`/profile/packages/${authorId}/${p.id}`}
                        className="flex items-center gap-3 min-w-0 group"
                      >
                        <ProjectThumb
                          previewUrl={p.previewUrl}
                          logoUrl={author.logoUrl}
                          label={author.label}
                        />
                        <div className="min-w-0">
                          <p className="font-medium truncate group-hover:text-blue-400 transition-colors">
                            {p.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">#{p.id}</span>
                            {p.videoPreviewUrl ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-blue-400">
                                <Film className="h-3 w-3" />
                                Video
                              </span>
                            ) : null}
                            {!p.previewUrl ? (
                              <span className="text-[11px] text-muted-foreground">
                                Author logo
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.version ? `v${p.version}` : "—"}
                    </TableCell>
                    <TableCell>
                      {p.downloadKey ? (
                        <Badge
                          variant="outline"
                          className="bg-blue-500/10 text-blue-400 border-blue-500/30 font-normal"
                        >
                          Zip linked
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No download</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-normal", status.className)}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatUpdated(p.updated_at)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <Link
                          href={`/profile/packages/${authorId}/${p.id}`}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {!loading && projects.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {filtered.length === projects.length
            ? `${projects.length} package${projects.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${projects.length} packages`}
        </p>
      ) : null}
    </div>
  );
}
