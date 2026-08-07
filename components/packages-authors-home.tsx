"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Package, Users } from "lucide-react";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";

type AuthorCard = {
  id: number;
  slug: string;
  label: string;
  logoUrl?: string;
};

export function PackagesAuthorsHome() {
  const [authors, setAuthors] = useState<AuthorCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/packages/authors");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { authors: AuthorCard[] };
      setAuthors(data.authors || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load authors");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Home · Packages</p>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-400" />
            Packages
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose an author to manage CEP packages (meta in DB, files on R2).
          </p>
        </div>
        <Link
          href="/profile/packages/authors"
          className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-card/40 px-3 py-2 text-sm hover:border-blue-500/40 hover:bg-blue-500/5 transition"
        >
          <Users className="h-4 w-4 text-blue-400" />
          Manage authors
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : authors.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading authors…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {authors.map((a) => (
            <Link
              key={a.id}
              href={`/profile/packages/${a.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border/80 bg-card/40 p-5 hover:border-blue-500/40 hover:bg-blue-500/5 transition"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.logoUrl || packagesAuthorLogoUrl(a.slug)}
                alt=""
                className="h-12 w-12 rounded-lg object-contain bg-muted/40 p-1.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground group-hover:text-blue-400 transition-colors">
                  {a.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  author_id {a.id} · {a.slug}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-blue-400 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
