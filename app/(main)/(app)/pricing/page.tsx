import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getActiveSubscriptionForUser } from "@/lib/subscriptions";
import { PricingPageClient } from "@/components/pricing-page-client";
import { affiliateRefSlugFromCookies } from "@/lib/affiliate/attribution";
import { marketplaceSaleHost } from "@/lib/marketplace-black-friday";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — Motion Flow Subscription Plans",
  description:
    "Choose your Motion Flow plan. Get unlimited downloads of After Effects, Premiere Pro & DaVinci Resolve templates plus AI tools. Monthly and yearly billing available.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — Motion Flow Subscription Plans",
    description:
      "Unlimited template downloads + AI tools. Monthly and yearly plans for video creators.",
    url: "https://motionflow.pro/pricing",
    type: "website",
  },
};

export default async function PricingPage({ searchParams }: {
  searchParams: Promise<{ "black-friday-preview"?: string | string[] }>;
}) {
  const [user, requestHeaders] = await Promise.all([getSessionUser(), headers()]);
  const saleHost = marketplaceSaleHost(requestHeaders);
  const salePreview = saleHost.local && (await searchParams)["black-friday-preview"] === "1";
  const currentSubscription = user
    ? await getActiveSubscriptionForUser(user.id)
    : null;

  // The referral cookie is httpOnly, so the checkout overlay can only forward
  // the slug to Paddle if the server hands it over here.
  const affiliateSlug = await affiliateRefSlugFromCookies();

  return (
    <PricingPageClient
      currentUser={user ? { id: user.id, email: user.email } : null}
      currentSubscription={currentSubscription}
      affiliateSlug={affiliateSlug}
      saleInitialTime={saleHost.allowed ? Date.now() : null}
      salePreview={salePreview}
    />
  );
}
