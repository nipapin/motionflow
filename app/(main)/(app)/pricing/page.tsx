import { getSessionUser } from "@/lib/auth/get-session-user";
import { getActiveSubscriptionForUser } from "@/lib/subscriptions";
import { PricingPageClient } from "@/components/pricing-page-client";

export const dynamic = "force-dynamic";

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
