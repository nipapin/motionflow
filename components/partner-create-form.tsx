"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AFFILIATE_SLUG_HINT, affiliateRefLink } from "@/lib/affiliate/shared";
import { cn } from "@/lib/utils";
import type { AffiliateRecurringMode } from "@/lib/affiliate/types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}

export function PartnerCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState("50");
  const [recurringMode, setRecurringMode] = useState<AffiliateRecurringMode>("all");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          socialUrl,
          slug: effectiveSlug,
          commissionPercent: Number(commissionPercent),
          recurringMode,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        affiliate?: { id: number };
        invited?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.affiliate) {
        setError(data.message ?? data.error ?? "Could not create the partner");
        return;
      }
      toast.success(
        data.invited
          ? "Partner created — invite email sent"
          : "Partner created and linked to the existing account",
      );
      router.push(`/profile/partners/${data.affiliate.id}`);
    } catch (err) {
      console.error("[partner-create]", err);
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-8">
      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="partner-name">Name</Label>
          <Input
            id="partner-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Editor"
            required
            minLength={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="partner-email">Email</Label>
          <Input
            id="partner-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="partner@example.com"
            required
          />
          <p className="text-xs text-muted-foreground">
            If no Motion Flow account uses this email we send an invite to set a password.
            An existing account gets the Affiliate tab right away.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="partner-social">Social link</Label>
          <Input
            id="partner-social"
            type="url"
            value={socialUrl}
            onChange={(e) => setSocialUrl(e.target.value)}
            placeholder="https://youtube.com/@channel"
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="partner-slug">Referral slug</Label>
          <Input
            id="partner-slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="jane-editor"
            required
          />
          <p className="text-xs text-muted-foreground">
            {AFFILIATE_SLUG_HINT}. Cannot be changed later —{" "}
            <span className="font-mono">{affiliateRefLink(effectiveSlug || "slug")}</span>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="partner-percent">Income %</Label>
          <Input
            id="partner-percent"
            type="number"
            min={1}
            max={100}
            step="0.01"
            value={commissionPercent}
            onChange={(e) => setCommissionPercent(e.target.value)}
            className="w-32"
            required
          />
          <p className="text-xs text-muted-foreground">
            Share of the net amount (what the buyer paid minus the Paddle fee).
          </p>
        </div>

        <div className="space-y-2">
          <Label>Income applies to</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "all", label: "Every payment", hint: "Renewals included" },
                { value: "first_only", label: "First payment only", hint: "One-time" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRecurringMode(option.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-sm smooth",
                  recurringMode === option.value
                    ? "border-blue-500/60 bg-blue-500/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:border-blue-500/30 hover:text-foreground",
                )}
              >
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create partner"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href="/profile/partners">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
