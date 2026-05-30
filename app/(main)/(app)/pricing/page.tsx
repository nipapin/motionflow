import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getActiveSubscriptionForUser } from "@/lib/subscriptions";
import { PricingPageClient } from "@/components/pricing-page-client";

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

export default async function PricingPage() {
  const user = await getSessionUser();
  const currentSubscription = user
    ? await getActiveSubscriptionForUser(user.id)
    : null;

  return (
    <PricingPageClient
      currentUser={user ? { id: user.id, email: user.email } : null}
      currentSubscription={currentSubscription}
    />
  );
}
