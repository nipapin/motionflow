"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { R2BucketSelect } from "@/components/r2-bucket-select";
import { newPackagesAuthorSchema } from "@/lib/packages-author-input";

export function PackagesAuthorCreate() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [r2Bucket, setR2Bucket] = useState("");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(true);
  const [bucketsError, setBucketsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/packages/buckets");
        if (!res.ok) throw new Error("Could not load buckets");
        const data = await res.json() as { buckets: string[] };
        if (!cancelled) setBuckets(data.buckets || []);
      } catch {
        if (!cancelled) setBucketsError(true);
      } finally {
        if (!cancelled) setBucketsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function createAuthor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const parsed = newPackagesAuthorSchema.safeParse({
      id: Number(id), label, slug, r2_bucket: r2Bucket || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Check the author settings");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/packages/authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json() as { author?: { id: number }; message?: string };
      if (!res.ok || !data.author) throw new Error(data.message || "Could not create the author");
      window.dispatchEvent(new Event("packages-authors-changed"));
      router.push(`/profile/packages/${data.author.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the author");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-4">
        <Link href="/profile/packages" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Authors
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Add Author</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Set up a new author to manage their packs and extension users.</p>
        </div>
      </header>

      <form onSubmit={createAuthor} className="rounded-xl border border-border/50 bg-card/30 p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3 border-b border-border/50 pb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400"><UserPlus className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Basic settings</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">You can configure packs after creating the author.</p>
          </div>
        </div>
        <fieldset disabled={busy} className="max-w-xl space-y-5">
          <div className="space-y-2">
            <Label htmlFor="new-author-label">Display name</Label>
            <Input id="new-author-label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={255} placeholder="Author name" autoComplete="off" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-author-id">Author ID</Label>
              <Input id="new-author-id" type="number" min={1} max={4294967295} step={1} value={id} onChange={(e) => setId(e.target.value)} required placeholder="e.g. 4141" aria-describedby="new-author-id-help" />
              <p id="new-author-id-help" className="text-[13px] leading-relaxed text-muted-foreground">Use the author ID assigned to their products and extension.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-author-slug">Slug</Label>
              <Input id="new-author-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="e.g. author-name" autoCapitalize="none" autoComplete="off" spellCheck={false} aria-describedby="new-author-slug-help" />
              <p id="new-author-slug-help" className="text-[13px] leading-relaxed text-muted-foreground">A unique name using lowercase letters, numbers and hyphens.</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-author-bucket">R2 bucket <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <R2BucketSelect id="new-author-bucket" value={r2Bucket} onChange={setR2Bucket} options={buckets} disabled={busy || bucketsLoading || bucketsError} />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {bucketsLoading ? "Loading available buckets…" : bucketsError ? "Buckets are unavailable. You can assign one in the author settings later." : "Choose the bucket containing the author’s packs, or set it later."}
            </p>
          </div>
          {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex items-center gap-3 border-t border-border/50 pt-5">
            <Button type="submit" disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {busy ? "Creating…" : "Create Author"}
            </Button>
            <Button variant="ghost" asChild><Link href="/profile/packages">Cancel</Link></Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
