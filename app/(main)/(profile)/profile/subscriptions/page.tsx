import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getSubscriptionsForUser } from "@/lib/subscriptions";
import { ProfileEmptyState } from "@/components/profile/profile-empty-state";
import { SubscriptionCard } from "@/components/subscription-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "My subscriptions",
};

export default async function ProfileSubscriptionsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const list = await getSubscriptionsForUser(user.id);

  if (list.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Unlimited download plans and billing</p>
        </div>
        <ProfileEmptyState
          icon={CreditCard}
          title="No active subscriptions"
          description="An unlimited download subscription unlocks the full catalog. Compare plans and billing intervals on the pricing page."
        >
          <Button asChild size="sm">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </ProfileEmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.length} subscription{list.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {list.map((item) => (
          <SubscriptionCard
            key={item.subscriptionId}
            item={item}
            userEmail={user.email}
          />
        ))}
      </div>
    </div>
  );
}
