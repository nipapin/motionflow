import type { Metadata } from "next";
import Link from "next/link";
import { Timer } from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { ProfileEmptyState } from "@/components/profile/profile-empty-state";
import { Button } from "@/components/ui/button";
import {
  marketplaceDownloadRateLimitMax,
  marketplaceDownloadRateLimitWindowMs,
} from "@/lib/marketplace-download-rate-limit";

export const metadata: Metadata = {
  title: "Download limit",
};

export const dynamic = "force-dynamic";

export default async function MarketplaceDownloadLimitPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const max = marketplaceDownloadRateLimitMax();
  const windowSec = Math.round(marketplaceDownloadRateLimitWindowMs() / 1000);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Temporary download limit</h1>
        <p className="mt-1 text-sm text-muted-foreground">Rate limit for marketplace downloads</p>
      </div>
      <ProfileEmptyState
        icon={Timer}
        title="Downloads paused briefly"
        description={
          <>
            There were many template downloads from your account in a short window. New project downloads resume after the
            limit resets — about <span className="tabular-nums text-foreground/90">{windowSec}s</span> rolling window, max{" "}
            <span className="tabular-nums text-foreground/90">{max}</span> per window. Need a larger batch or something
            specific for a team? Tell us what you need.
          </>
        }
        className="border-amber-500/20 bg-amber-500/3"
      >
        <Button asChild size="sm">
          <Link href="/contact">Contact us</Link>
        </Button>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="border-primary/45 text-primary hover:bg-primary/10 dark:hover:bg-primary/15"
        >
          <Link href="/profile/downloads">Back to downloads</Link>
        </Button>
      </ProfileEmptyState>
      <p className="text-center text-xs text-muted-foreground">
        <a
          href="mailto:support@motionflow.pro"
          className="font-medium text-primary underline underline-offset-4 hover:text-primary/90"
        >
          support@motionflow.pro
        </a>
      </p>
    </div>
  );
}
