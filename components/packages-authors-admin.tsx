"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";

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
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = authors.find((a) => a.id === selectedId) ?? null;

  const load = useCallback(async () => {
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
    // Keep currently saved bucket visible even if ListBuckets briefly omits it.
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
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 w-full">
      <div>
        <Link
          href="/profile/packages"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Packages
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Authors</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick an R2 bucket from your account for each author. Pack editors browse that bucket.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <ul className="space-y-1">
          {authors.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelectedId(a.id)}
                className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  selectedId === a.id
                    ? "border-blue-500/40 bg-blue-500/10"
                    : "border-border/60 bg-card/30 hover:bg-foreground/5"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.logoUrl || packagesAuthorLogoUrl(a.slug)}
                  alt=""
                  className="h-7 w-7 rounded object-contain bg-muted/40 p-0.5"
                />
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground font-mono">
                    {a.r2_bucket || "no bucket"}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <div className="rounded-xl border border-blue-500/20 bg-card/40 p-5 space-y-4 max-w-xl">
            <p className="text-xs text-muted-foreground">
              #{selected.id} · {selected.slug}
            </p>
            <label className="block text-xs text-muted-foreground">
              Label
              <input
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              R2 bucket
              <select
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
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
            </label>
            {bucketsError ? (
              <p className="text-xs text-destructive">{bucketsError}</p>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Buckets are loaded live from R2 (ListBuckets) using the server API token.
              </p>
            )}
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveAuthor()}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save
            </Button>
            {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select an author.</p>
        )}
      </div>
    </div>
  );
}
