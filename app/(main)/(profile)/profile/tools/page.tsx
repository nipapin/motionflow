import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { affiliateNavFlags } from "@/lib/affiliate/nav";
import { TOOLS_NAVIGATION } from "@/lib/profile-navigation";
import { ProfileSectionOverview } from "@/components/profile-section-overview";

export const metadata: Metadata = { title: "Tools" };
export const dynamic = "force-dynamic";

export default async function ToolsOverviewPage() {
  if (!(await affiliateNavFlags()).showUsers) redirect("/profile");
  return <ProfileSectionOverview group="tools" items={TOOLS_NAVIGATION} />;
}
