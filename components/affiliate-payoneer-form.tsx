"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AffiliatePayoneerForm({ payoneerEmail }: { payoneerEmail: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState(payoneerEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/affiliate/payoneer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoneerEmail: email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Could not save");
        return;
      }
      toast.success(email ? "Payoneer email saved" : "Payoneer email removed");
      router.refresh();
    } catch (err) {
      console.error("[affiliate-payoneer]", err);
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-xl space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="payoneer-email">Payoneer email</Label>
        <Input
          id="payoneer-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        <p className="text-xs text-muted-foreground">
          Where we send your payouts. Without it your balance still accrues, but we cannot
          transfer it.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
