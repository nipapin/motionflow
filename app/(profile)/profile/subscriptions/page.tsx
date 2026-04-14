import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getSubscriptionsForUser } from "@/lib/subscriptions";
import { SubscriptionCard } from "@/components/subscription-card";

export const metadata: Metadata = {
  title: "My subscriptions",
};

export default async function ProfileSubscriptionsPage() {
  const user = await getSessionUser();
  if (!user) return null;

  const list = await getSubscriptionsForUser(user.id);

  if (list.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">My subscriptions</h1>
        <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-card/40 px-6 py-14 text-center">
          <h2 className="mb-2 text-lg font-medium">
            You don&apos;t have an{" "}
            <span className="text-primary">unlimited download</span> subscription.
          </h2>
          <p className="mb-6 text-muted-foreground">
            Explore and use the full power of an unlimited subscription!
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-xl bg-linear-to-r from-blue-600 to-blue-500 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/25 smooth hover:from-blue-500 hover:to-blue-400"
          >
            Explore the subscription
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">My subscriptions</h1>
      {list.map((item) => (
        <SubscriptionCard
          key={item.subscriptionId}
          item={item}
          userEmail={user.email}
        />
      ))}
    </div>
  );
}
