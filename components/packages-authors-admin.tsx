"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";
import { cn } from "@/lib/utils";

type AuthorDto = {
  id: number;
  slug: string;
  label: string;
  r2_bucket: string | null;
  logoUrl?: string;
};

export function PackagesAuthorsAdmin() {
  const [authors, setAuthors] = useState<AuthorDto[]>([]);
  const [buckets, setBuckets] = useState<string[]>([]);
  const [bucketsError, setBucketsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [r2Bucket, setR2Bucket] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = authors.find((a) => a.id === selectedId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBucketsError(null);
    try {
      const [authorsRes, bucketsRes] = await Promise.all([
        fetch("/api/packages/authors"),
        fetch("/api/packages/buckets"),
      ]);
      if (!authorsRes.ok) throw new Error(await authorsRes.text());
      const authorsData = (await authorsRes.json()) as { authors: AuthorDto[] };
      setAuthors(authorsData.authors || []);
      setSelectedId((prev) => prev ?? authorsData.authors?.[0]?.id ?? null);

      if (bucketsRes.ok) {
        const bucketsData = (await bucketsRes.json()) as { buckets: string[] };
        setBuckets(bucketsData.buckets || []);
      } else {
        setBuckets([]);
        setBucketsError("Could not load R2 buckets");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setLabel(selected.label);
    setR2Bucket(selected.r2_bucket || "");
    setMsg(null);
  }, [selected]);

  const bucketOptions = (() => {
    const set = new Set(buckets);
    if (r2Bucket) set.add(r2Bucket);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  })();

  const saveAuthor = async () => {
    if (!selectedId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/packages/authors/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
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
      const data = (await res.json()) as { author: AuthorDto };
      setAuthors((prev) =>
        prev.map((a) => (a.id === data.author.id ? { ...a, ...data.author } : a)),
      );
      setR2Bucket(data.author.r2_bucket || "");
      setMsg("Saved");
      setMsgOk(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
      setMsgOk(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-4">
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
          <span className="text-foreground/80">Authors</span>
        </nav>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Authors</h1>
          <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            Display name and R2 bucket for each author. Pack editors browse that bucket for zips.
          </p>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <ul className="space-y-1" role="listbox" aria-label="Authors">
            {authors.map((a) => {
              const active = selectedId === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(a.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-foreground/6 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/3 hover:text-foreground",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.logoUrl || packagesAuthorLogoUrl(a.slug)}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-md bg-muted/50 object-contain p-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {a.label}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {a.r2_bucket || "No bucket"}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected ? (
            <div className="space-y-6 rounded-xl border border-border/50 px-5 py-6 sm:px-7">
              <div>
                <p className="text-[13px] text-muted-foreground">
                  #{selected.id} · {selected.slug}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">{selected.label}</h2>
              </div>

              <div className="max-w-md space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="author-label">Display name</Label>
                  <Input
                    id="author-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="author-bucket">R2 bucket</Label>
                  <select
                    id="author-bucket"
                    className={cn(
                      "border-input h-9 w-full rounded-md border bg-transparent px-3 font-mono text-sm outline-none",
                      "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                    value={r2Bucket}
                    onChange={(e) => setR2Bucket(e.target.value)}
                    disabled={busy || (bucketOptions.length === 0 && !r2Bucket)}
                  >
                    <option value="">— Not set —</option>
                    {bucketOptions.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  {bucketsError ? (
                    <p className="text-[13px] text-destructive">{bucketsError}</p>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Loaded live from R2 via ListBuckets.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 gap-1.5"
                    disabled={busy}
                    onClick={() => void saveAuthor()}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                  {msg ? (
                    <p
                      className={cn(
                        "text-[13px]",
                        msgOk
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive",
                      )}
                      role="status"
                    >
                      {msgOk ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          {msg}
                        </span>
                      ) : (
                        msg
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select an author.</p>
          )}
        </div>
      )}
    </div>
  );
}
