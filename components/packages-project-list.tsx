"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Package, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  updated_at: string;
};

export function PackagesProjectList({ authorId }: { authorId: number }) {
  const author = getPackagesAuthorPublicById(authorId);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/profile/packages"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Packages
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-400" />
            {author.label}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Projects for author_id {author.id}
          </p>
        </div>
        <div className="flex gap-2">
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
            New project
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading && projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No projects yet. Create one to attach preview, video, version, and an R2 download.
        </p>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/profile/packages/${authorId}/${p.id}`}
                className="flex items-center gap-4 rounded-xl border border-blue-500/20 bg-card/40 px-4 py-3 hover:border-blue-500/50 hover:bg-blue-500/5 transition"
              >
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.previewUrl}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover bg-muted shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.version ? `v${p.version}` : "no version"}
                    {p.downloadKey ? " · zip linked" : " · no download"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
