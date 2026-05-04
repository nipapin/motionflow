import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
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
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Temporary download limit</h1>
      <div className="rounded-2xl border border-amber-500/35 bg-card/40 px-6 py-10 text-center glow">
        <p className="mx-auto mb-4 max-w-md text-muted-foreground">
          There were many template downloads from your account in a short period. To keep the library
          fair for everyone, new project downloads pause until this window resets (about{" "}
          <span className="text-foreground/90">{windowSec}s</span> per rolling window, limit{" "}
          <span className="text-foreground/90">{max}</span> per window).
        </p>
        <p className="mx-auto mb-6 max-w-md text-muted-foreground">
          Looking for something specific or need a larger batch for a team? Tell us what you need — we&apos;re happy to help.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="inline-flex items-center rounded-xl bg-linear-to-r from-blue-600 to-blue-500 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/25 smooth hover:from-blue-500 hover:to-blue-400"
          >
            Contact us
          </Link>
          <Link
            href="/profile/downloads"
            className="inline-flex items-center rounded-xl border border-border bg-background px-6 py-2.5 text-sm font-medium smooth hover:bg-accent"
          >
            Back to My downloads
          </Link>
        </div>
        <p className="mx-auto mt-6 max-w-md text-xs text-muted-foreground">
          <a href="mailto:support@motionflow.pro" className="text-blue-600 underline-offset-4 hover:underline dark:text-blue-400">
            support@motionflow.pro
          </a>
        </p>
      </div>
    </div>
  );
}
