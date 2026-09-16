"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AffiliateCopyLink } from "@/components/affiliate-copy-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AFFILIATE_CAMPAIGN_HINT, affiliateRefLink } from "@/lib/affiliate/shared";
import type { AffiliateCampaignLink } from "@/lib/affiliate/types";

export function AffiliateCampaignLinks({
  slug,
  campaigns,
}: {
  slug: string;
  campaigns: AffiliateCampaignLink[];
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/affiliate/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Could not save the link");
        return;
      }
      toast.success("Campaign link created");
      setCode("");
      router.refresh();
    } catch (err) {
      console.error("[affiliate-campaigns]", err);
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Default link</p>
        <AffiliateCopyLink link={affiliateRefLink(slug)} className="max-w-xl" />
      </div>

      {campaigns.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Campaign links</p>
          <ul className="space-y-2">
            {campaigns.map((campaign) => (
              <li key={campaign.code}>
                <AffiliateCopyLink
                  link={affiliateRefLink(slug, campaign.code)}
                  className="max-w-xl"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={create} className="max-w-xl space-y-2">
        <Label htmlFor="campaign-code">New campaign</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="campaign-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase())}
            placeholder="campaign-name"
            className="max-w-xs"
          />
          <Button type="submit" disabled={saving || !code.trim()}>
            {saving ? "Saving…" : "Create link"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Becomes {affiliateRefLink(slug, code.trim() || "campaign-name")}. {AFFILIATE_CAMPAIGN_HINT}.
          Your id ({slug}) never changes.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
