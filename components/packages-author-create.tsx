"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Database, Loader2, Plus, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { R2BucketSelect } from "@/components/r2-bucket-select";
import { newPackagesAuthorSchema, newPackagesBucketSchema, packagesAuthorSlug } from "@/lib/packages-author-input";
import { cn } from "@/lib/utils";

type AuthorUser = { id: number; name: string; email: string; authorExists: boolean };

export function PackagesAuthorCreate() {
  const router = useRouter();
  const [emailSearch, setEmailSearch] = useState("");
  const [users, setUsers] = useState<AuthorUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AuthorUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const slug = packagesAuthorSlug(label);
  const [r2Bucket, setR2Bucket] = useState("");
  const [buckets, setBuckets] = useState<string[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(true);
  const [bucketsError, setBucketsError] = useState(false);
  const [bucketMode, setBucketMode] = useState<"existing" | "new">("existing");
  const [bucketName, setBucketName] = useState("");
  const [bucketBusy, setBucketBusy] = useState(false);
  const [bucketError, setBucketError] = useState<string | null>(null);
  const [bucketMessage, setBucketMessage] = useState<string | null>(null);
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

  useEffect(() => {
    const q = emailSearch.trim();
    if (q.length < 3 || selectedUser) { setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/packages/authors/users?q=${encodeURIComponent(q)}`, { signal: controller.signal });
          const data = await res.json() as { users?: AuthorUser[]; message?: string };
          if (!res.ok) throw new Error(data.message || "Could not search users");
          if (!controller.signal.aborted) setUsers(data.users || []);
        } catch (err) {
          if (!controller.signal.aborted) setSearchError(err instanceof Error ? err.message : "Could not search users");
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      })();
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [emailSearch, selectedUser]);

  function selectUser(user: AuthorUser) {
    setSelectedUser(user);
    setEmailSearch(user.email);
    setUsers([]);
    setLabel((current) => current || user.name);
    setError(null);
  }

  async function createBucket() {
    if (bucketBusy || busy) return;
    setBucketError(null);
    setBucketMessage(null);
    const parsed = newPackagesBucketSchema.safeParse({ name: bucketName });
    if (!parsed.success) { setBucketError(parsed.error.issues[0]?.message || "Check the bucket name"); return; }
    setBucketBusy(true);
    try {
      const res = await fetch("/api/packages/buckets", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      const data = await res.json() as { bucket?: string; message?: string };
      if (!res.ok || !data.bucket) throw new Error(data.message || "Could not create the bucket");
      const bucket = data.bucket;
      setBuckets((current) => [...new Set([...current, bucket])].sort());
      setR2Bucket(bucket);
      setBucketsError(false);
      setBucketMode("existing");
      setBucketMessage(`Bucket “${bucket}” created and selected.`);
    } catch (err) {
      setBucketError(err instanceof Error ? err.message : "Could not create the bucket");
    } finally { setBucketBusy(false); }
  }

  async function createAuthor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || bucketBusy) return;
    setError(null);
    if (!selectedUser) { setError("Find and select an existing user by email"); return; }
    if (bucketMode === "new") { setError("Create the new bucket first, or select an existing bucket"); return; }
    const parsed = newPackagesAuthorSchema.safeParse({ id: selectedUser.id, label, r2_bucket: r2Bucket || null });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Check the author settings"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/packages/authors", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
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
    <div className="w-full space-y-8">
      <header className="space-y-4">
        <Link href="/profile/packages" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Authors
        </Link>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Add Author</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Choose a user and set up their author profile and pack storage.</p>
        </div>
      </header>

      <form onSubmit={createAuthor} className="overflow-hidden rounded-xl border border-border/50 bg-card/30">
        <fieldset disabled={busy || bucketBusy} className="min-w-0">
          <div className="grid lg:grid-cols-2">
            <section className="min-w-0 space-y-6 border-b border-border/50 p-5 sm:p-7 lg:border-r lg:border-b-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400"><UserPlus className="h-5 w-5" /></div>
                <div><h2 className="font-semibold">User account</h2><p className="mt-0.5 text-[13px] text-muted-foreground">Find the author’s existing account by email.</p></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-author-email">Search by email</Label>
                <div className="relative">
                  <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="new-author-email" type="search" value={emailSearch} maxLength={254} autoComplete="off" placeholder="author@example.com" className="pl-9" onChange={(e) => {
                    setEmailSearch(e.target.value); setSelectedUser(null); setUsers([]); setSearchError(null); setError(null);
                  }} aria-describedby="new-author-search-help" />
                </div>
                <p id="new-author-search-help" className="text-[13px] text-muted-foreground">Enter at least 3 characters, then choose a user below.</p>
                <div aria-live="polite">
                  {searching ? <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching users…</p> : null}
                  {searchError ? <p role="alert" className="text-sm text-destructive">{searchError}</p> : null}
                  {!selectedUser && !searching && !searchError && emailSearch.trim().length >= 3 && users.length === 0 ? <p className="py-2 text-sm text-muted-foreground">No users found.</p> : null}
                </div>
                {users.length ? <ul aria-label="Matching users" className="max-h-64 overflow-y-auto rounded-lg border border-border/50">
                  {users.map((user) => <li key={user.id} className="border-b border-border/40 last:border-b-0">
                    <button type="button" disabled={user.authorExists} onClick={() => selectUser(user)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{user.name || user.email}</span><span className="block truncate text-[13px] text-muted-foreground">{user.email}</span></span>
                      <span className="shrink-0 text-xs text-muted-foreground">{user.authorExists ? "Already an author" : `#${user.id}`}</span>
                    </button>
                  </li>)}
                </ul> : null}
              </div>
              {selectedUser ? <div className="flex items-start gap-3 rounded-lg border border-blue-500/25 bg-blue-500/5 p-4">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                <div className="min-w-0"><p className="truncate text-sm font-medium">{selectedUser.name || selectedUser.email}</p><p className="mt-1 truncate text-[13px] text-muted-foreground">{selectedUser.email}</p></div>
              </div> : null}
              <div className="space-y-2">
                <Label htmlFor="new-author-id">Author ID</Label>
                <Input id="new-author-id" readOnly value={selectedUser?.id ?? ""} placeholder="Assigned after selecting a user" className="bg-muted/30 font-mono" />
                <p className="text-[13px] text-muted-foreground">Taken automatically from the selected user account.</p>
              </div>
            </section>

            <section className="min-w-0 space-y-6 p-5 sm:p-7">
              <div><h2 className="font-semibold">Author profile</h2><p className="mt-0.5 text-[13px] text-muted-foreground">Set the public name for this author.</p></div>
              <div className="space-y-2">
                <Label htmlFor="new-author-label">Display name</Label>
                <Input id="new-author-label" value={label} onChange={(e) => { setLabel(e.target.value); setError(null); }} required maxLength={255} placeholder="Display Name" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-author-slug">Slug</Label>
                <Input id="new-author-slug" value={slug} readOnly placeholder="display-name" className="bg-muted/30 font-mono" />
                <p className="text-[13px] leading-relaxed text-muted-foreground">Generated from Display name. For example: Display Name → display-name.</p>
              </div>
              <p className="rounded-lg bg-muted/30 p-4 text-[13px] leading-relaxed text-muted-foreground">Each user can have one author profile. The name must generate a unique slug; both are checked when you create the author.</p>
            </section>
          </div>

          <section className="space-y-5 border-t border-border/50 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3"><Database className="h-5 w-5 shrink-0 text-blue-400" /><div><h2 className="font-semibold">Pack storage</h2><p className="mt-0.5 text-[13px] text-muted-foreground">Choose an R2 bucket or create a new one.</p></div></div>
              <div className="inline-flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
                {(["existing", "new"] as const).map((mode) => <button key={mode} type="button" aria-pressed={bucketMode === mode} onClick={() => {
                  setBucketMode(mode); setBucketError(null); if (mode === "new" && !bucketName) setBucketName(slug);
                }} className={cn("rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", bucketMode === mode ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {mode === "existing" ? "Select existing" : "Create new"}
                </button>)}
              </div>
            </div>
            {bucketMode === "existing" ? <div className="space-y-2">
              <Label htmlFor="new-author-bucket">R2 bucket <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <R2BucketSelect id="new-author-bucket" value={r2Bucket} onChange={setR2Bucket} options={buckets} disabled={busy || bucketBusy || bucketsLoading || bucketsError} />
              <p className="text-[13px] leading-relaxed text-muted-foreground">{bucketsLoading ? "Loading available buckets…" : bucketsError ? "Could not load buckets. You can create one here or assign storage later." : "You can leave this empty and assign a bucket later."}</p>
            </div> : <div className="space-y-2">
              <Label htmlFor="new-author-bucket-name">New bucket name</Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input id="new-author-bucket-name" value={bucketName} onChange={(e) => setBucketName(e.target.value)} maxLength={63} placeholder={slug || "author-packs"} autoCapitalize="none" autoComplete="off" spellCheck={false} className="font-mono" />
                <Button type="button" variant="outline" disabled={bucketBusy || busy || !bucketName.trim()} onClick={() => void createBucket()} className="shrink-0 gap-2">
                  {bucketBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {bucketBusy ? "Creating bucket…" : "Create bucket"}
                </Button>
              </div>
              <p className="text-[13px] text-muted-foreground">3–63 lowercase letters, numbers or hyphens. Start and end with a letter or number.</p>
            </div>}
            {bucketError ? <p role="alert" className="text-sm text-destructive">{bucketError}</p> : null}
            {bucketMessage ? <p role="status" className="flex items-center gap-2 text-sm text-emerald-500"><Check className="h-4 w-4 shrink-0" /> {bucketMessage}</p> : null}
          </section>
          <div className="space-y-4 border-t border-border/50 p-5 sm:px-7">
            {error ? <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || bucketBusy || !selectedUser || !slug || bucketMode === "new"} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{busy ? "Creating…" : "Create Author"}
              </Button>
              <Button variant="ghost" asChild><Link href="/profile/packages">Cancel</Link></Button>
            </div>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
