"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AuthorCard = {
  id: number;
  slug: string;
  label: string;
  logoUrl?: string;
};

export function PackagesAuthorsHome() {
  const [authors, setAuthors] = useState<AuthorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/packages/authors");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { authors: AuthorCard[] };
      setAuthors(data.authors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load authors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="w-full space-y-10">
      <header className="space-y-2">
        <p className="text-[13px] text-muted-foreground">Admin</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Authors
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Pick an author to manage CEP packs and see who is using their extension.
        </p>
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
        <ul className="divide-y divide-border/60 rounded-xl border border-border/50">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
            </li>
          ))}
        </ul>
      ) : authors.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 px-6 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No authors yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Authors will appear here once they are available for your account.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/50">
          {authors.map((a) => (
            <li key={a.id}>
              <Link
                href={`/profile/packages/${a.id}`}
                className={cn(
                  "group flex items-center gap-4 px-5 py-4 transition-colors",
                  "hover:bg-foreground/3 focus-visible:bg-foreground/3",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.logoUrl || packagesAuthorLogoUrl(a.slug)}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-lg bg-muted/60 object-contain p-1.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium tracking-tight text-foreground">
                    {a.label}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {a.slug}
                  </p>
                </div>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
