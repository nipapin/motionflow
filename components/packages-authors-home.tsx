"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { packagesAuthorLogoUrl } from "@/lib/packages-admin-client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileNavigationCard, PROFILE_CARD_GRID } from "@/components/profile-navigation-card";

type AuthorCard = { id: number; slug: string; label: string; logoUrl?: string };

export function PackagesAuthorsHome() {
  const [authors, setAuthors] = useState<AuthorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/packages/authors");
      if (!res.ok) throw new Error("Could not load authors. Try again.");
      const data = await res.json() as { authors: AuthorCard[] };
      setAuthors(data.authors || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load authors");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="w-full space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-blue-400">Workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight">Authors</h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">Manage author libraries, CEP packages and extension users.</p>
        </div>
        <Button asChild className="gap-2"><Link href="/profile/packages/authors/new"><Plus className="h-4 w-4" /> Add Author</Link></Button>
      </header>

      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-destructive/10 px-5 py-4 text-sm text-destructive">
        {error}<Button type="button" variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
      </div> : null}

      {loading ? <div className={PROFILE_CARD_GRID} aria-label="Loading authors">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="min-h-60 space-y-5 rounded-2xl border border-border/60 p-6">
          <Skeleton className="h-14 w-14 rounded-xl" /><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-full" />
        </div>)}
      </div> : <div className={PROFILE_CARD_GRID}>
        {authors.map((author) => <ProfileNavigationCard key={author.id}
          href={`/profile/packages/${author.id}`} label={author.label}
          logoUrl={author.logoUrl || packagesAuthorLogoUrl(author.slug)} meta={author.slug}
          description="Manage CEP packages and the users of this author’s extension."
          action="Manage author"
        />)}
        <ProfileNavigationCard href="/profile/packages/authors/new" label="Add Author" icon={Plus}
          description="Connect a user account and configure storage for a new author library."
          action="Create author" create
        />
      </div>}
    </div>
  );
}
