import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { affiliateNavFlags } from "@/lib/affiliate/nav";
import { managementNavigationItems } from "@/lib/profile-navigation";
import { ProfileSectionOverview } from "@/components/profile-section-overview";

export const metadata: Metadata = { title: "Management" };
export const dynamic = "force-dynamic";

export default async function ManagementOverviewPage() {
  const flags = await affiliateNavFlags();
  const items = managementNavigationItems(flags);
  if (!items.length) redirect("/profile");
  return <ProfileSectionOverview group="management" items={items} />;
}
