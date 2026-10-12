import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/get-session-user";
import { affiliateNavFlags } from "@/lib/affiliate/nav";
import { ACCOUNT_NAVIGATION, AFFILIATE_NAVIGATION } from "@/lib/profile-navigation";
import { ProfileSectionOverview } from "@/components/profile-section-overview";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountOverviewPage() {
  if (!(await getSessionUser())) redirect("/");
  const { showAffiliate } = await affiliateNavFlags();
  return <ProfileSectionOverview group="account" items={[...ACCOUNT_NAVIGATION, ...(showAffiliate ? [AFFILIATE_NAVIGATION] : [])]} />;
}
