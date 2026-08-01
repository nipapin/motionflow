import { redirect } from "next/navigation";

/**
 * The CEP panel's "Manage subscription" button opens /account/subscription
 * (see CEP/spunkram-library/docs/BACKEND_CEP_API.md §2). The actual
 * subscription management UI lives at /profile/subscriptions.
 */
export default function AccountSubscriptionPage() {
  redirect("/profile/subscriptions");
}
