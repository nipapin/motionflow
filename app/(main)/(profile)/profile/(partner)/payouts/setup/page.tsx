import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { getUserPayoutProfile } from "@/lib/author/payouts";
import { PayoutSetupForm } from "@/components/author/payout-setup-form";

export const metadata: Metadata = {
  title: "Payout setup",
};

export const dynamic = "force-dynamic";

export default async function PayoutSetupPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const profile = await getUserPayoutProfile(user.id);
  if (!profile) redirect("/profile/payouts");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Change payout method</h1>
        <p className="text-muted-foreground">Updates your `users` withdraw fields (same as Laravel setup).</p>
      </div>
      <PayoutSetupForm
        initialMethod={profile.withdrawMethod ?? "payproglobal"}
        initialMin={profile.withdrawMinAmount}
        initialAccountJson={profile.withdrawAccount}
      />
    </div>
  );
}
